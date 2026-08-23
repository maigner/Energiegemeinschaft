import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { renderOpenhabianConf, renderProvisionConf, renderUserData } from '$lib/server/db/members/openhabProvision';

// Fertige SD-Karten-Images je Anlage (docs/ibm-setup-vereinfachung.md):
// offizielles openHABian-Image + openhabian.conf, ibm-provision.conf und
// user-data auf der FAT-Boot-Partition (eingespielt mit mcopy/mtools, kein
// Root noetig), als <name>.img.gz zum Flashen mit dem Raspberry Pi Imager
// auf jedem Betriebssystem. Auch der Restore einer defekten Karte laeuft so:
// "Neuer Code", Image neu erstellen, flashen.
//
// Ablage unter IBM_IMAGE_DIR (Produktion: Docker-Volume, siehe
// run-docker.sh). Je Anlage liegt dort <name>.img.gz, <name>.json
// (Metadaten: Code, Stand) und ggf. <name>.error; das Basis-Image wird
// unter base/ gecacht. Es baut immer nur ein Image gleichzeitig; der
// Fortschritt steckt im Prozess (Neustart bricht den Bau ab, der Zustand
// faellt dann auf die Dateien zurueck).

const RELEASES_API = 'https://api.github.com/repos/openhab/openhabian/releases/latest';
const NEEDED_BYTES = 7e9; // Basis-Image + entpacktes Arbeits-Image + Ergebnis

/** Laufender Bau (nur einer gleichzeitig).
 *  @type {{ name: string, phase: string, startedAt: string } | null} */
let current = null;

function imageDir() {
    return env.IBM_IMAGE_DIR || (dev ? 'data/ibm-images' : '/var/lib/ischlstrom/images');
}

/** @param {string} name */
const imageFile = (name) => path.join(imageDir(), `${name}.img.gz`);
/** @param {string} name */
const metaFile = (name) => path.join(imageDir(), `${name}.json`);
/** @param {string} name */
const errorFile = (name) => path.join(imageDir(), `${name}.error`);

/** @param {string} file */
async function readJson(file) {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Zustand fuer das Dashboard: `building` waehrend des Baus, `image` wenn ein
 * fertiges Image liegt (`stale`, wenn es mit einem anderen als dem aktuellen
 * Code gebaut wurde oder der Code abgelaufen ist), `error` wenn der letzte
 * Bau fehlschlug (ein aelteres Image bleibt daneben nutzbar).
 * @param {{ name: string, provision_code: string, provision_expires: any }} plant
 */
export async function getImageStatus(plant) {
    const building = current && current.name === plant.name
        ? { phase: current.phase, startedAt: current.startedAt }
        : null;
    const meta = await readJson(metaFile(plant.name));
    const err = await readJson(errorFile(plant.name));
    const expired = plant.provision_expires && new Date(plant.provision_expires) < new Date();
    return {
        building,
        image: meta ? {
            builtAt: meta.builtAt,
            size: meta.size,
            stale: meta.code !== plant.provision_code || Boolean(expired)
        } : null,
        error: !building && err && (!meta || err.at > meta.builtAt)
            ? { message: err.message, at: err.at }
            : null
    };
}

/** Pfad und Groesse des fertigen Images, oder null. @param {string} name */
export async function imageDownload(name) {
    const file = imageFile(name);
    try {
        const stat = await fs.stat(file);
        return { file, size: stat.size, stream: () => createReadStream(file) };
    } catch {
        return null;
    }
}

/** Image-Dateien einer Anlage entfernen (beim Loeschen der Anlage). @param {string} name */
export async function deleteImage(name) {
    for (const f of [imageFile(name), metaFile(name), errorFile(name)]) {
        await fs.rm(f, { force: true });
    }
}

/** @param {string} cmd @param {string[]} args @param {import('node:child_process').SpawnOptions} [opts] */
function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], ...opts });
        let stderr = '';
        child.stderr?.on('data', (d) => (stderr += d));
        child.on('error', (e) => reject(new Error(`${cmd}: ${e.message}`)));
        child.on('close', (code) =>
            code === 0 ? resolve(undefined) : reject(new Error(`${cmd} (Exit ${code}): ${stderr.trim().slice(0, 500)}`))
        );
    });
}

/** Byte-Offset der ersten Partition (FAT-Boot-Partition) aus dem MBR. @param {string} img */
async function bootPartitionOffset(img) {
    const fh = await fs.open(img, 'r');
    try {
        const mbr = Buffer.alloc(512);
        await fh.read(mbr, 0, 512, 0);
        if (mbr.readUInt16LE(510) !== 0xaa55) throw new Error('Image ohne MBR-Signatur.');
        const type = mbr[446 + 4];
        if (type !== 0x0b && type !== 0x0c) {
            throw new Error(`Erste Partition ist keine FAT32 (Typ 0x${type.toString(16)}).`);
        }
        return mbr.readUInt32LE(446 + 8) * 512;
    } finally {
        await fh.close();
    }
}

/**
 * Aktuelles openHABian-Basis-Image (64-bit) in den Cache laden; bei
 * Netzproblemen wird das neueste bereits gecachte verwendet.
 */
async function ensureBaseImage() {
    const baseDir = path.join(imageDir(), 'base');
    await fs.mkdir(baseDir, { recursive: true });
    const cached = (await fs.readdir(baseDir)).filter((f) => f.endsWith('.img.xz')).sort();

    let name = '';
    let url = '';
    try {
        const release = await (await fetch(RELEASES_API)).json();
        const assets = (release.assets ?? [])
            .filter((/** @type {any} */ a) => a.name.startsWith('openhabian-raspios64') && a.name.endsWith('.img.xz'))
            .sort((/** @type {any} */ a, /** @type {any} */ b) => a.name.localeCompare(b.name));
        const asset = assets.at(-1);
        if (asset) ({ name, browser_download_url: url } = asset);
    } catch {
        // unten: Cache-Fallback
    }
    if (!name) {
        const newest = cached.at(-1);
        if (!newest) throw new Error('openHABian-Releaseliste nicht erreichbar und kein Basis-Image im Cache.');
        return path.join(baseDir, newest);
    }

    const file = path.join(baseDir, name);
    if (!cached.includes(name)) {
        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(`Basis-Image nicht ladbar (HTTP ${res.status}).`);
        await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), createWriteStream(`${file}.part`));
        await fs.rename(`${file}.part`, file);
        // alte Basis-Images aufraeumen
        for (const old of cached) await fs.rm(path.join(baseDir, old), { force: true });
    }
    return file;
}

/**
 * Baut das fertige SD-Karten-Image einer Anlage im Hintergrund. Wirft
 * sofort, wenn schon ein Bau laeuft; der Ausgang steht danach in
 * getImageStatus() (<name>.json bzw. <name>.error).
 *
 * @param {any} plant  Zeile aus getProvisioning() (entschluesselt)
 * @param {string} baseUrl
 */
export async function startImageBuild(plant, baseUrl) {
    if (current) {
        throw new Error(
            current.name === plant.name
                ? 'Dieses Image wird gerade gebaut.'
                : `Es wird gerade ein Image gebaut (${current.name}) - bitte warten.`
        );
    }
    await fs.mkdir(imageDir(), { recursive: true });
    const stat = await fs.statfs(imageDir());
    if (stat.bavail * stat.bsize < NEEDED_BYTES) {
        throw new Error('Zu wenig freier Speicher fuer den Image-Bau (7 GB noetig).');
    }

    const state = { name: plant.name, phase: 'Basis-Image laden', startedAt: new Date().toISOString() };
    current = state;
    void build(plant, baseUrl, state).catch(() => {});
}

/** @param {any} plant @param {string} baseUrl @param {{ phase: string }} state */
async function build(plant, baseUrl, state) {
    const name = plant.name;
    const work = path.join(imageDir(), `${name}.work.img`);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ibm-image-'));
    try {
        const base = await ensureBaseImage();

        state.phase = 'Basis-Image entpacken';
        const xz = spawn('xz', ['-dc', base], { stdio: ['ignore', 'pipe', 'pipe'] });
        let xzErr = '';
        xz.stderr.on('data', (d) => (xzErr += d));
        const done = new Promise((resolve, reject) => {
            xz.on('close', (code) => (code === 0 ? resolve(undefined) : reject(new Error(`xz (Exit ${code}): ${xzErr.trim()}`))));
            xz.on('error', (e) => reject(new Error(`xz: ${e.message}`)));
        });
        await pipeline(xz.stdout, createWriteStream(work));
        await done;

        state.phase = 'Konfiguration einspielen';
        const offset = await bootPartitionOffset(work);
        const files = {
            'openhabian.conf': renderOpenhabianConf(plant),
            'ibm-provision.conf': renderProvisionConf(plant, baseUrl),
            'user-data': await renderUserData()
        };
        for (const [file, content] of Object.entries(files)) {
            await fs.writeFile(path.join(tmp, file), content);
        }
        await run('mcopy', ['-o', '-i', `${work}@@${offset}`, ...Object.keys(files).map((f) => path.join(tmp, f)), '::/']);

        state.phase = 'komprimieren';
        await pipeline(createReadStream(work), zlib.createGzip({ level: 6 }), createWriteStream(`${imageFile(name)}.part`));
        await fs.rename(`${imageFile(name)}.part`, imageFile(name));

        const size = (await fs.stat(imageFile(name))).size;
        await fs.writeFile(metaFile(name), JSON.stringify({
            code: plant.provision_code,
            base: path.basename(base),
            builtAt: new Date().toISOString(),
            size
        }));
        await fs.rm(errorFile(name), { force: true });
    } catch (e) {
        await fs.writeFile(errorFile(name), JSON.stringify({
            message: e instanceof Error ? e.message : String(e),
            at: new Date().toISOString()
        })).catch(() => {});
    } finally {
        current = null;
        await fs.rm(work, { force: true });
        await fs.rm(`${imageFile(name)}.part`, { force: true });
        await fs.rm(tmp, { recursive: true, force: true });
    }
}
