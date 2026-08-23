// ============================================================================
// openHAB-Cloud-Konto einer IBM-Anlage anlegen bzw. Passwort setzen.
//
// Laeuft IM Cloud-Container (offizielles Image openhab/openhab-cloud, das
// kein eigenes CLI mitbringt) und wird von ibm-provision-sync.sh per
//   docker compose exec -T -e IBM_... app node - < cloud-makeuser.js
// hineingereicht. Es benutzt die kompilierten Modelle des Images
// (/opt/openhabcloud/dist/models) und dessen config.json fuer die
// Mongo-Verbindung - also genau das, was die laufende Cloud selbst nutzt.
//
// Eingabe ueber Umgebungsvariablen:
//   IBM_USERNAME      Benutzername (Mail-Adresse, z. B. 007@ischlstrom.org)
//   IBM_PASSWORD_ENC  Passwort, verschluesselt wie in der Website-DB
//                     ("enc1:<iv>:<ciphertext+tag>", Base64, AES-256-GCM)
//   IBM_UUID          openHAB-UUID der Anlage
//   IBM_SECRET_ENC    Cloud-Secret der Anlage, verschluesselt wie oben
//   IBM_SECRET_KEY    Schluessel (64 Hex-Zeichen, IBM_SECRET_KEY der Website)
//   IBM_MODE          "upsert" (Vorgabe) oder "delete": Benutzer, Konto und
//                     openHAB-Instanz loeschen (nur IBM_USERNAME noetig)
//
// Idempotent: existiert der Benutzer, wird nur das Passwort gesetzt und die
// Anlage (UUID/Secret) am Konto abgeglichen. verifiedEmail wird auf true
// gesetzt, eine Verifikations-Mail gibt es nicht. Ausgabe: eine JSON-Zeile
// {"ok":true,...} bzw. {"ok":false,"error":"..."}; Exit-Code 0/1.
// ============================================================================
'use strict';

const crypto = require('crypto');

function decrypt(stored, keyHex) {
  if (!stored) return '';
  if (!stored.startsWith('enc1:')) return stored;
  const [, ivB64, ctB64] = stored.split(':');
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(ctB64, 'base64');
  const tag = data.subarray(data.length - 16);
  const ct = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function out(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exit(code);
}

async function deleteUser(username) {
  let dbConnect, models;
  try {
    dbConnect = require('./dist/cli/db-connect');
    models = require('./dist/models');
  } catch (e) {
    out({ ok: false, error: `Cloud-Image ohne dist/cli bzw. dist/models: ${e.message}` }, 1);
  }
  const { User, UserAccount, Openhab } = models;
  await dbConnect.connectToDatabase();
  const user = await User.findOne({ username }).exec();
  if (!user) out({ ok: true, action: 'not_found', username }, 0);
  const others = await User.countDocuments({ account: user.account, _id: { $ne: user._id } }).exec();
  await Openhab.deleteMany({ account: user.account }).exec();
  await User.deleteOne({ _id: user._id }).exec();
  if (others === 0 && UserAccount) await UserAccount.deleteOne({ _id: user.account }).exec();
  out({ ok: true, action: 'deleted', username }, 0);
}

async function main() {
  const env = process.env;
  if ((env.IBM_MODE || 'upsert') === 'delete') {
    if (!env.IBM_USERNAME) out({ ok: false, error: 'IBM_USERNAME fehlt' }, 1);
    await deleteUser(env.IBM_USERNAME.trim().toLowerCase());
    return;
  }
  for (const name of ['IBM_USERNAME', 'IBM_PASSWORD_ENC', 'IBM_UUID', 'IBM_SECRET_ENC', 'IBM_SECRET_KEY']) {
    if (!env[name]) out({ ok: false, error: `${name} fehlt` }, 1);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(env.IBM_SECRET_KEY)) out({ ok: false, error: 'IBM_SECRET_KEY ungueltig' }, 1);

  const username = env.IBM_USERNAME.trim().toLowerCase();
  const password = decrypt(env.IBM_PASSWORD_ENC, env.IBM_SECRET_KEY);
  const secret = decrypt(env.IBM_SECRET_ENC, env.IBM_SECRET_KEY);
  const uuid = env.IBM_UUID.trim();
  if (!password || password.length < 8) out({ ok: false, error: 'Passwort leer oder zu kurz' }, 1);
  if (!secret) out({ ok: false, error: 'Secret leer' }, 1);

  let dbConnect, models;
  try {
    dbConnect = require('./dist/cli/db-connect');
    models = require('./dist/models');
  } catch (e) {
    out({ ok: false, error: `Cloud-Image ohne dist/cli bzw. dist/models: ${e.message}` }, 1);
  }
  const { User, Openhab } = models;

  await dbConnect.connectToDatabase();
  try {
    let user = await User.findOne({ username }).exec();
    let action;
    if (user) {
      user.password = password;            // Virtual: erzeugt salt/hash (bcrypt)
      user.verifiedEmail = true;
      user.active = true;
      await user.save();
      action = 'password_set';
    } else {
      user = await User.register(username, password);
      user.verifiedEmail = true;
      await user.save();
      action = 'created';
    }

    // Anlage am Konto: genau eine openHAB-Instanz je Konto (Cloud-Modell).
    const byUuid = await Openhab.findOne({ uuid }).exec();
    if (byUuid && String(byUuid.account) !== String(user.account)) {
      out({ ok: false, error: `UUID ${uuid} gehoert bereits zu einem anderen Konto` }, 1);
    }
    let openhab = await Openhab.findOne({ account: user.account }).exec();
    if (openhab) {
      if (openhab.uuid !== uuid || openhab.secret !== secret) {
        openhab.uuid = uuid;
        openhab.secret = secret;
        await openhab.save();
        action += '+openhab_updated';
      }
    } else {
      openhab = new Openhab({ account: user.account, uuid, secret });
      await openhab.save();
      action += '+openhab_created';
    }
    out({ ok: true, action, username }, 0);
  } finally {
    await dbConnect.disconnectFromDatabase().catch(() => {});
  }
}

main().catch((e) => out({ ok: false, error: e && e.message ? e.message : String(e) }, 1));
