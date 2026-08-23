import { middlewareDbConnection } from "$lib/server/db/db";
import { env } from '$env/dynamic/private';
import {
    encryptSecret,
    decryptSecret,
    randomPassword,
    randomProvisionCode,
    randomCloudUuid,
    randomCloudSecret
} from '$lib/server/secrets';
import { ensureMailcowAlias } from '$lib/server/mailcow';

// Zero-Touch-Provisionierung der IBM-Anlagen (docs/ibm-setup-vereinfachung.md).
// "SD-Karte vorbereiten" auf /board/openhab legt hier alles an, was der
// Einrichtungsassistent frueher am Pi abgefragt hat; der Pi holt es mit dem
// Provisionierungs-Code ueber POST /api/ibm/provision/v1 ab und meldet
// Fortschritt und Ergebnisse an /api/ibm/provision/v1/result.

/** Gueltigkeit eines Provisionierungs-Codes: die SD-Karte kann ein paar
 *  Wochen liegen, bevor das Mitglied den Pi ansteckt. */
const PROVISION_CODE_DAYS = 60;

/** Tunnel-IPs: <prefix>.11 bis <prefix>.254 (10.88.0.1 ist s1). */
const WG_FIRST_HOST = 11;
const WG_LAST_HOST = 254;

/** Einrichtungsphasen, die der Pi meldet (Reihenfolge = Fortschritt). */
export const SETUP_PHASES = [
    'konfiguration',
    'wechselrichter_suche',
    'wechselrichter_unklar',
    'tunnel',
    'passwoerter',
    'cloud',
    'addons',
    'wartet_auf_passwort',
    'wechselrichter',
    'items',
    'regeln',
    'overview',
    'fertig'
];

function wgPrefix() {
    return env.IBM_WG_SUBNET_PREFIX || '10.88.0';
}

function cloudMailDomain() {
    return env.IBM_CLOUD_MAIL_DOMAIN || 'ischlstrom.org';
}

/** @param {number} identifier */
export function memberNumber(identifier) {
    return String(identifier).padStart(3, '0');
}

/**
 * Entschluesselt die Geheimnisse einer Zeile fuer die Anzeige.
 * @param {any} row
 */
async function withSecrets(row) {
    if (!row) return null;
    return {
        ...row,
        cloud_secret: await decryptSecret(row.cloud_secret),
        cloud_password: await decryptSecret(row.cloud_password),
        linux_password: await decryptSecret(row.linux_password),
        wifi_password: await decryptSecret(row.wifi_password),
        inverter_password_set: Boolean(row.inverter_password)
    };
}

const PROVISION_COLUMNS = `
    s.id, s.member_id, s.token, s.name, s.created_at, s.last_seen,
    EXTRACT(EPOCH FROM (now() - s.last_seen)) AS age_seconds,
    s.provision_code, s.provision_expires, s.provisioned_at,
    s.inverter_type, s.inverter_username, s.inverter_password,
    s.wg_address, s.wg_public_key, s.wg_synced_at,
    s.cloud_uuid, s.cloud_secret, s.cloud_username, s.cloud_password,
    s.cloud_account_state, s.cloud_account_error, s.mail_alias_state,
    s.linux_password, s.wifi_ssid, s.wifi_password,
    s.setup_phase, s.setup_message, s.setup_phase_at,
    m.identifier AS member_identifier, m.name AS member_name, m.email AS member_email`;

/**
 * Naechste freie Tunnel-IP. Belegt sind alle wg_address der Tabelle; die
 * Bestandsanlagen (pi-003, pi-007) muessen dafuer einmalig eingetragen sein
 * (macht scripts/ibm-provision/setup-on-s1.sh aus der wg0.conf).
 * @param {any} db
 */
async function nextWgAddress(db) {
    const prefix = wgPrefix();
    const result = await db.query(
        `SELECT wg_address FROM members_openhabstatus WHERE wg_address LIKE $1`,
        [`${prefix}.%`]
    );
    const used = new Set(result.rows.map((/** @type {any} */ r) => Number(r.wg_address.split('.').pop())));
    for (let host = WG_FIRST_HOST; host <= WG_LAST_HOST; host++) {
        if (!used.has(host)) return `${prefix}.${host}`;
    }
    throw new Error('Keine freie Tunnel-IP mehr im Wartungsnetz.');
}

/**
 * "SD-Karte vorbereiten": legt die Anlage eines Mitglieds an bzw. bereitet
 * eine bestehende erneut vor (Ersatz-Pi, neue Karte). Idempotent je
 * Mitglied: gibt es schon eine Anlage des Mitglieds, werden Token,
 * Tunnel-IP, Cloud-Identitaet und Passwoerter beibehalten und nur Code und
 * Einrichtungsphase erneuert.
 *
 * @param {{ memberId: number, inverterType?: string, wifiSsid?: string, wifiPassword?: string, statusId?: number }} input
 * @returns {Promise<number>} members_openhabstatus.id
 */
export const provisionPlant = async ({ memberId, inverterType = '', wifiSsid = '', wifiPassword = '', statusId }) => {
    const db = await middlewareDbConnection();
    try {
        const member = (await db.query(
            `SELECT id, identifier, name FROM members_member WHERE id = $1`, [memberId]
        )).rows[0];
        if (!member) throw new Error('Mitglied nicht gefunden.');

        const nnn = memberNumber(member.identifier);
        const cloudUsername = `${nnn}@${cloudMailDomain()}`;

        // Bestehende Anlage des Mitglieds wiederverwenden (die neueste,
        // oder die ausdruecklich gewaehlte).
        const existing = (statusId
            ? await db.query(`SELECT * FROM members_openhabstatus WHERE id = $1 AND member_id = $2`, [statusId, memberId])
            : await db.query(`SELECT * FROM members_openhabstatus WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1`, [memberId])
        ).rows[0];

        const code = randomProvisionCode();
        const expires = new Date(Date.now() + PROVISION_CODE_DAYS * 86400 * 1000);
        const wgAddress = existing?.wg_address || await nextWgAddress(db);
        const linuxPassword = existing?.linux_password || await encryptSecret(randomPassword(14));
        const cloudUuid = existing?.cloud_uuid || randomCloudUuid();
        const cloudSecret = existing?.cloud_secret || await encryptSecret(randomCloudSecret());
        const cloudPassword = existing?.cloud_password || await encryptSecret(randomPassword(16));
        const cloudState = existing?.cloud_account_state === 'created' ? 'created' : 'pending';
        const name = existing?.name || `pi-${nnn}`;
        const wifiPw = wifiPassword ? await encryptSecret(wifiPassword) : (wifiSsid ? (existing?.wifi_password ?? '') : '');

        // Mail-Alias zuerst: schlaegt das fehl, steht es am Dashboard, die
        // Anlage wird trotzdem angelegt.
        let aliasState = existing?.mail_alias_state || '';
        if (aliasState !== 'created') {
            try {
                const r = await ensureMailcowAlias(cloudUsername);
                aliasState = r === 'skipped' ? 'skipped' : 'created';
            } catch (e) {
                aliasState = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
                console.log(`mailcow alias failed for plant of member ${member.identifier}: ${aliasState}`);
            }
        }

        let id;
        if (existing) {
            id = existing.id;
            await db.query(
                `UPDATE members_openhabstatus
                    SET name = $2, provision_code = $3, provision_expires = $4, provisioned_at = NULL,
                        inverter_type = $5, wg_address = $6, linux_password = $7,
                        cloud_uuid = $8, cloud_secret = $9, cloud_username = $10, cloud_password = $11,
                        cloud_account_state = $12, cloud_account_error = '', mail_alias_state = $13,
                        wifi_ssid = $14, wifi_password = $15,
                        setup_phase = '', setup_message = '', setup_phase_at = NULL
                  WHERE id = $1`,
                [id, name, code, expires, inverterType, wgAddress, linuxPassword,
                 cloudUuid, cloudSecret, cloudUsername, cloudPassword, cloudState, aliasState,
                 wifiSsid, wifiPw]
            );
        } else {
            const token = crypto.randomUUID().replaceAll('-', '');
            const result = await db.query(
                `INSERT INTO members_openhabstatus
                    (member_id, token, name, created_at, last_seen, data,
                     provision_code, provision_expires, inverter_type, inverter_username, inverter_password,
                     wg_address, wg_public_key, linux_password,
                     cloud_uuid, cloud_secret, cloud_username, cloud_password,
                     cloud_account_state, cloud_account_error, mail_alias_state,
                     wifi_ssid, wifi_password, setup_phase, setup_message)
                 VALUES ($1, $2, $3, now(), NULL, '{}',
                         $4, $5, $6, '', '',
                         $7, '', $8,
                         $9, $10, $11, $12,
                         'pending', '', $13,
                         $14, $15, '', '')
                 RETURNING id`,
                [memberId, token, name, code, expires, inverterType, wgAddress, linuxPassword,
                 cloudUuid, cloudSecret, cloudUsername, cloudPassword, aliasState, wifiSsid, wifiPw]
            );
            id = result.rows[0].id;
        }
        console.log(`ibm provisioning prepared: plant ${id} (member ${member.identifier})`);
        return id;
    } finally {
        db.release();
    }
};

/**
 * Alle Anlagen mit Provisionierungsdaten (Geheimnisse entschluesselt) fuer
 * das Vorstands-Dashboard.
 */
export const listProvisioning = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT ${PROVISION_COLUMNS}
               FROM members_openhabstatus s
               JOIN members_member m ON s.member_id = m.id
              ORDER BY m.identifier, s.created_at`
        );
        return Promise.all(result.rows.map(withSecrets));
    } finally {
        db.release();
    }
};

/**
 * Eine Anlage mit Provisionierungsdaten (Geheimnisse entschluesselt).
 * @param {number} id
 */
export const getProvisioning = async (id) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT ${PROVISION_COLUMNS}
               FROM members_openhabstatus s
               JOIN members_member m ON s.member_id = m.id
              WHERE s.id = $1`,
            [id]
        );
        return await withSecrets(result.rows[0]);
    } finally {
        db.release();
    }
};

/**
 * Anlagen eines Mitglieds (nach Mitgliedsnummer) fuer den Mitgliederbereich.
 * Liefert nur, was das Mitglied sehen darf: Zustand, Cloud-Zugang,
 * Einrichtungsphase und ob das Wechselrichter-Passwort schon hinterlegt ist.
 * @param {number} memberIdentifier
 */
export const getMemberPlants = async (memberIdentifier) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT s.id, s.name, s.last_seen,
                    EXTRACT(EPOCH FROM (now() - s.last_seen)) AS age_seconds,
                    s.data, s.inverter_type, s.inverter_password <> '' AS inverter_password_set,
                    s.cloud_username, s.cloud_password, s.cloud_account_state,
                    s.linux_password, s.provision_code IS NOT NULL AS provisioned,
                    s.setup_phase, s.setup_message, s.setup_phase_at
               FROM members_openhabstatus s
               JOIN members_member m ON s.member_id = m.id
              WHERE m.identifier = $1 AND s.setup_phase <> 'geloescht'
              ORDER BY s.created_at`,
            [memberIdentifier]
        );
        return Promise.all(result.rows.map(async (/** @type {any} */ row) => ({
            ...row,
            cloud_password: await decryptSecret(row.cloud_password),
            linux_password: await decryptSecret(row.linux_password)
        })));
    } finally {
        db.release();
    }
};

/**
 * Provisionierungs-Code einloesen (POST /api/ibm/provision/v1). Der Code
 * bleibt bis zum Abschluss der Einrichtung (Phase "fertig") oder bis zum
 * Ablauf gueltig, damit ein abgebrochener Lauf neu starten kann.
 * Geheimnisse kommen entschluesselt zurueck.
 *
 * @param {string} code
 * @returns {Promise<any | null>}
 */
export const consumeProvisionCode = async (code) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `UPDATE members_openhabstatus s
                SET provisioned_at = COALESCE(s.provisioned_at, now())
               FROM members_member m
              WHERE s.member_id = m.id
                AND s.provision_code = $1
                AND s.provision_expires > now()
                AND s.setup_phase <> 'fertig'
             RETURNING ${PROVISION_COLUMNS}`,
            [code]
        );
        const row = await withSecrets(result.rows[0]);
        if (!row) return null;
        return { ...row, inverter_password: await decryptSecret(result.rows[0].inverter_password) };
    } finally {
        db.release();
    }
};

/**
 * Neuen Code vergeben (Karte neu schreiben, Code abgelaufen).
 * @param {number} id
 */
export const renewProvisionCode = async (id) => {
    const db = await middlewareDbConnection();
    try {
        const code = randomProvisionCode();
        const expires = new Date(Date.now() + PROVISION_CODE_DAYS * 86400 * 1000);
        await db.query(
            `UPDATE members_openhabstatus
                SET provision_code = $2, provision_expires = $3, provisioned_at = NULL,
                    setup_phase = '', setup_message = '', setup_phase_at = NULL
              WHERE id = $1`,
            [id, code, expires]
        );
        return code;
    } finally {
        db.release();
    }
};

/**
 * Wechselrichter-Profil setzen (Vorstand, wenn der Pi "wechselrichter_unklar"
 * meldet, oder als Vorgabe).
 * @param {number} id
 * @param {string} inverterType
 */
export const setInverterType = async (id, inverterType) => {
    const db = await middlewareDbConnection();
    try {
        await db.query(`UPDATE members_openhabstatus SET inverter_type = $2 WHERE id = $1`, [id, inverterType]);
    } finally {
        db.release();
    }
};

/**
 * Zugangsdaten des Wechselrichters hinterlegen (Mitglied oder Vorstand).
 * Das Passwort liegt verschluesselt, bis der Pi es abholt.
 * @param {number} id
 * @param {string} username
 * @param {string} password
 */
export const setInverterCredentials = async (id, username, password) => {
    const db = await middlewareDbConnection();
    try {
        await db.query(
            `UPDATE members_openhabstatus SET inverter_username = $2, inverter_password = $3 WHERE id = $1`,
            [id, username, await encryptSecret(password)]
        );
    } finally {
        db.release();
    }
};

/**
 * Wechselrichter-Zugangsdaten einmalig an den Pi ausliefern und danach
 * serverseitig loeschen (POST /api/ibm/provision/v1/secret). Transaktion:
 * erst lesen, dann loeschen.
 * @param {string} token
 * @returns {Promise<{ known: boolean, credentials: { username: string, password: string } | null }>}
 */
export const popInverterCredentials = async (token) => {
    const db = await middlewareDbConnection();
    try {
        await db.query('BEGIN');
        const sel = await db.query(
            `SELECT id, inverter_username, inverter_password
               FROM members_openhabstatus
              WHERE token = $1 FOR UPDATE`,
            [token]
        );
        const row = sel.rows[0];
        if (!row) { await db.query('ROLLBACK'); return { known: false, credentials: null }; }
        if (!row.inverter_password) { await db.query('ROLLBACK'); return { known: true, credentials: null }; }
        await db.query(`UPDATE members_openhabstatus SET inverter_password = '' WHERE id = $1`, [row.id]);
        await db.query('COMMIT');
        return {
            known: true,
            credentials: { username: row.inverter_username, password: await decryptSecret(row.inverter_password) }
        };
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        db.release();
    }
};

/**
 * Meldung des Pi waehrend der Einrichtung (POST /api/ibm/provision/v1/result):
 * Phase, Meldungstext, WireGuard-Public-Key, erkanntes Profil, Hostname.
 * Liefert die aktuelle Zeile (fuer die Antwort: vom Vorstand gesetztes
 * Profil, ob ein Wechselrichter-Passwort bereitliegt).
 *
 * @param {string} token
 * @param {{ phase?: string, message?: string, wg_public_key?: string, inverter_type?: string, hostname?: string }} report
 */
export const reportSetup = async (token, report) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `UPDATE members_openhabstatus
                SET setup_phase = COALESCE(NULLIF($2, ''), setup_phase),
                    setup_message = CASE WHEN $2 <> '' THEN $3 ELSE setup_message END,
                    setup_phase_at = CASE WHEN $2 <> '' THEN now() ELSE setup_phase_at END,
                    wg_public_key = COALESCE(NULLIF($4, ''), wg_public_key),
                    wg_synced_at = CASE WHEN $4 <> '' AND $4 <> wg_public_key THEN NULL ELSE wg_synced_at END,
                    inverter_type = COALESCE(NULLIF($5, ''), inverter_type),
                    name = COALESCE(NULLIF($6, ''), name)
              WHERE token = $1
             RETURNING id, inverter_type, inverter_password <> '' AS inverter_password_set,
                       setup_phase, cloud_account_state, wg_synced_at`,
            [token, report.phase ?? '', report.message ?? '', report.wg_public_key ?? '',
             report.inverter_type ?? '', report.hostname ?? '']
        );
        return result.rows[0] ?? null;
    } finally {
        db.release();
    }
};

/**
 * Neues Cloud-Passwort anfordern (Mitgliederbereich oder Dashboard): der
 * s1-Timer setzt es im Cloud-Konto (cloud_account_state = reset).
 * @param {number} id
 * @returns {Promise<string>} das neue Passwort
 */
export const requestCloudPasswordReset = async (id) => {
    const db = await middlewareDbConnection();
    try {
        const password = randomPassword(16);
        await db.query(
            `UPDATE members_openhabstatus
                SET cloud_password = $2, cloud_account_state = 'reset', cloud_account_error = ''
              WHERE id = $1`,
            [id, await encryptSecret(password)]
        );
        return password;
    } finally {
        db.release();
    }
};

/**
 * Cloud-Konto erneut anlegen lassen (nach einem Fehler).
 * @param {number} id
 */
export const retryCloudAccount = async (id) => {
    const db = await middlewareDbConnection();
    try {
        await db.query(
            `UPDATE members_openhabstatus
                SET cloud_account_state = 'pending', cloud_account_error = ''
              WHERE id = $1`,
            [id]
        );
    } finally {
        db.release();
    }
};

/**
 * Inhalt der openhabian.conf fuer die Boot-Partition: die Vorgaben des
 * openHABian-Images (Stand v1.12) mit den Werten der Anlage. Die Marker
 * zram_reset/srv_mount_fix gehoeren zum Image und bleiben erhalten.
 * userpw entfernt openHABian nach dem ersten Boot selbst aus der Datei.
 *
 * @param {{ name: string, linux_password: string, wifi_ssid?: string, wifi_password?: string }} plant
 */
export function renderOpenhabianConf(plant) {
    const q = (/** @type {string} */ v) => `"${String(v ?? '').replace(/(["\\$`])/g, '\\$1')}"`;
    const wifi = plant.wifi_ssid
        ? `wifi_ssid=${q(plant.wifi_ssid)}\nwifi_password=${q(plant.wifi_password ?? '')}\nwifi_country="AT"`
        : `wifi_ssid=""\nwifi_password=""\nwifi_country="AT"`;
    return `# openHABian-Konfiguration fuer ${plant.name} (ISCHLSTROM Speichermanagement)
# Erzeugt von ischlstrom.org/board/openhab - auf die Boot-Partition der
# SD-Karte kopieren (ersetzt die mitgelieferte openhabian.conf).
hostname=${plant.name}
username=openhabian
userpw=${q(plant.linux_password)}
adminkeyurl=""
timezone=Europe/Vienna
locales="en_US.UTF-8 de_DE.UTF-8"
system_default_locale="en_US.UTF-8"
ipv6=enable
framebuffer=enable
${wifi}
repositoryurl=https://github.com/openhab/openhabian.git
clonebranch=openHAB
debugmode=on
apttimeout=60
java_opt=21
frontail_remove=false
zraminstall=enable
zram_reset=done # remove when zram is no longer needed to auto update
srv_mount_fix=done # remove when the /srv mount order fix (#2060) is no longer needed
hotspot=enable
hotspotpw=openhabian
deconz_install=disable
storageconfig=openhab-dir
storagedir=/storage
storagetapes=15
storagecapacity=1024
`;
}

/**
 * Inhalt der ibm-provision.conf fuer die Boot-Partition: nur Code und
 * Server - kein Token, kein Passwort.
 * @param {{ provision_code: string }} plant
 * @param {string} baseUrl
 */
export function renderProvisionConf(plant, baseUrl) {
    return `# ISCHLSTROM Speichermanagement - Provisionierung
# Der Pi holt damit beim ersten Start seine Konfiguration von ischlstrom.org.
# Wird nach erfolgreicher Einrichtung automatisch geloescht.
IBM_PROVISION_CODE=${plant.provision_code}
IBM_BASE_URL=${baseUrl}
`;
}

/**
 * Anlage loeschen. Zweistufig, weil WireGuard-Peer und Cloud-Konto nur der
 * s1-Timer entfernen kann: die Zeile wird als "geloescht" markiert
 * (setup_phase = 'geloescht', Cloud-Konto -> 'delete', Code und
 * Wechselrichter-Passwort sofort weg); ibm-provision-sync.sh nimmt den Peer
 * aus der wg0.conf, loescht das Cloud-Konto und danach die Zeile (samt
 * Verlauf). Ohne Peer und ohne Cloud-Konto (klassisches Token) wird sofort
 * geloescht.
 *
 * @param {number} id
 * @returns {Promise<'deleted' | 'marked'>}
 */
export const deletePlant = async (id) => {
    const db = await middlewareDbConnection();
    try {
        const row = (await db.query(
            `SELECT wg_public_key, cloud_account_state FROM members_openhabstatus WHERE id = $1`, [id]
        )).rows[0];
        if (!row) return 'deleted';
        const hasPeer = row.wg_public_key !== '';
        const hasCloud = ['pending', 'created', 'reset', 'error'].includes(row.cloud_account_state);
        if (!hasPeer && !hasCloud) {
            await db.query(`DELETE FROM members_openhabstatus WHERE id = $1`, [id]);
            return 'deleted';
        }
        await db.query(
            `UPDATE members_openhabstatus
                SET setup_phase = 'geloescht', setup_message = '', setup_phase_at = now(),
                    provision_code = NULL, provision_expires = NULL,
                    inverter_password = '', wifi_password = '',
                    cloud_account_state = CASE WHEN $2 THEN 'delete' ELSE '' END,
                    cloud_account_error = ''
              WHERE id = $1`,
            [id, hasCloud]
        );
        return 'marked';
    } finally {
        db.release();
    }
};

/**
 * Loeschung zuruecknehmen, solange der Timer die Zeile noch nicht entfernt
 * hat: Peer bleibt (war nie weg, wenn der Timer noch nicht lief) bzw. wird
 * wieder eingetragen, Cloud-Konto wird neu angelegt, neuer Code.
 * @param {number} id
 */
export const undeletePlant = async (id) => {
    const db = await middlewareDbConnection();
    try {
        await db.query(
            `UPDATE members_openhabstatus
                SET setup_phase = '', setup_phase_at = NULL, wg_synced_at = NULL,
                    cloud_account_state = CASE WHEN cloud_username <> '' THEN 'pending' ELSE '' END
              WHERE id = $1 AND setup_phase = 'geloescht'`,
            [id]
        );
        return renewProvisionCode(id);
    } finally {
        db.release();
    }
};
