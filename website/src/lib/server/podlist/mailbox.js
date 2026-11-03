// Podlist-Mails aus dem Postfach info@ischlstrom.org holen (IMAP ueber
// mailcow auf s1). EEG-Faktura schickt die angeforderte Zaehlpunktliste mit
// Betreff `RC101533 Zaehlpunktliste <JJJJMMTT-HHMM>` und dem Anhang
// `RC101533_<JJJJMMTT-HHMM>_ZP_PODLIST.xlsx` dorthin.
//
// Das Postfach lesen auch Menschen: der Job markiert nichts als gelesen und
// verschiebt nichts. Verarbeitet ist eine Mail, sobald ihre Message-ID in
// members_podlistimport steht (auch bei Fehlern, damit ein kaputter Anhang
// nur einmal gemeldet wird). Gesucht wird im Betreff, geprueft wird der
// Anhang selbst (Blatt ZP-List, Spalten); der Absender spielt keine Rolle.
//
// Konfiguration (website/.env):
//   IMAP_HOST, IMAP_PORT (993 = TLS, sonst STARTTLS), IMAP_USER, IMAP_PASSWORD
//   (App-Passwort nur fuer IMAP, mailcow: Mailbox -> App-Passwoerter)
//
// Reines Modul ohne SvelteKit-Importe (scripts/podlist-fetch.js).

import { ImapFlow } from 'imapflow';
import { parsePodlistSheet, requestedAtFromText, archiveFileName } from './sheet.js';
import { hasPodlistMessage, storePodlistImport, storePodlistFailure } from './db.js';

export const SUBJECT_MARKER = 'Zählpunktliste';
export const DEFAULT_MAILBOX = 'INBOX';
export const DEFAULT_SINCE_DAYS = 90;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const ATTACHMENT_NAME = /ZP_PODLIST.*\.xlsx$/i;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * @typedef {{ host: string, port: number, secure: boolean, user: string, password: string }} ImapConfig
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {ImapConfig | null} null, wenn IMAP nicht konfiguriert ist
 */
export const imapConfigFromEnv = (env) => {
    const host = (env.IMAP_HOST ?? '').trim();
    const user = (env.IMAP_USER ?? '').trim();
    const password = env.IMAP_PASSWORD ?? '';
    if (!host || !user || !password) return null;
    const port = Number(env.IMAP_PORT) || 993;
    return { host, port, secure: port === 993, user, password };
};

/**
 * Den xlsx-Anhang in der MIME-Struktur finden: Dateiname `*ZP_PODLIST*.xlsx`
 * oder der xlsx-Medientyp.
 * @param {import('imapflow').MessageStructureObject | undefined} node
 * @returns {{ part: string, fileName: string, size: number } | null}
 */
export const findSpreadsheetPart = (node) => {
    if (!node) return null;
    const fileName = node.dispositionParameters?.filename ?? node.parameters?.name ?? '';
    const isXlsx = ATTACHMENT_NAME.test(fileName) || node.type?.toLowerCase() === XLSX_TYPE;
    if (isXlsx && node.part) {
        return { part: node.part, fileName: fileName || 'ZP_PODLIST.xlsx', size: node.size ?? 0 };
    }
    for (const child of node.childNodes ?? []) {
        const found = findSpreadsheetPart(child);
        if (found) return found;
    }
    return null;
};

/**
 * @param {import('node:stream').Readable} stream
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
const readAll = async (stream, maxBytes) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
        total += chunk.length;
        if (total > maxBytes) {
            stream.destroy();
            throw new Error(`Anhang größer als ${Math.round(maxBytes / 1024 / 1024)} MB`);
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

/**
 * @typedef {{
 *   messageId: string, subject: string, fileName: string, requestedAt: string | null,
 *   status: 'imported' | 'skipped' | 'error' | 'dry-run',
 *   rowCount?: number, unknownCount?: number, warnings?: string[], error?: string, archivedAs?: string | null,
 * }} MailResult
 */

/**
 * Postfach durchsehen und neue Podlists importieren.
 *
 * @param {{
 *   config: ImapConfig,
 *   db: import('pg').Pool | null,            // null nur im Probelauf
 *   mailbox?: string,
 *   sinceDays?: number,
 *   dryRun?: boolean,                         // nichts schreiben, nichts archivieren
 *   archive?: ((buffer: Buffer, fileName: string) => Promise<string | null>) | null, // Ablage, liefert Pfad
 *   log?: (line: string) => void,
 * }} options
 * @returns {Promise<MailResult[]>}
 */
export const fetchPodlistMails = async ({ config, db, mailbox = DEFAULT_MAILBOX, sinceDays = DEFAULT_SINCE_DAYS, dryRun = false, archive = null, log = () => {} }) => {
    if (!dryRun && !db) throw new Error('fetchPodlistMails: ohne db nur als Probelauf möglich');
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.password },
        logger: false,
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 120_000,
    });
    /** @type {MailResult[]} */
    const results = [];
    await client.connect();
    try {
        const lock = await client.getMailboxLock(mailbox);
        try {
            const since = new Date(Date.now() - sinceDays * 86_400_000);
            const found = await client.search({ subject: SUBJECT_MARKER, since }, { uid: true });
            const uids = Array.isArray(found) ? found : [];
            log(`${uids.length} Mail(s) mit "${SUBJECT_MARKER}" im Betreff seit ${since.toISOString().slice(0, 10)} in ${mailbox}`);
            for (const uid of uids) {
                const message = await client.fetchOne(String(uid), { uid: true, envelope: true, bodyStructure: true }, { uid: true });
                if (!message) continue;
                const subject = message.envelope?.subject ?? '';
                // Server-Suche ist unscharf (Charset); den Betreff selbst noch einmal pruefen
                if (!subject.toLowerCase().includes(SUBJECT_MARKER.toLowerCase())) continue;
                const messageId = message.envelope?.messageId?.trim() || `uid:${uid}@${mailbox}`;
                const requestedAt = requestedAtFromText(subject);
                if (!dryRun && db && (await hasPodlistMessage(db, messageId))) {
                    results.push({ messageId, subject, fileName: '', requestedAt, status: 'skipped' });
                    continue;
                }
                const part = findSpreadsheetPart(message.bodyStructure);
                if (!part) {
                    const error = 'kein xlsx-Anhang (ZP_PODLIST) in der Mail';
                    log(`Fehler ${subject}: ${error}`);
                    if (!dryRun && db) await storePodlistFailure(db, { source: 'mail', fileName: '', messageId, requestedAt, error });
                    results.push({ messageId, subject, fileName: '', requestedAt, status: 'error', error });
                    continue;
                }
                const fileName = part.fileName;
                try {
                    if (part.size > MAX_ATTACHMENT_BYTES) throw new Error(`Anhang größer als ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
                    const download = await client.download(String(uid), part.part, { uid: true });
                    if (!('content' in download) || !download.content) throw new Error('Anhang nicht ladbar');
                    const buffer = await readAll(download.content, MAX_ATTACHMENT_BYTES);
                    const { entries, warnings } = parsePodlistSheet(buffer);
                    if (!entries.length) throw new Error('keine gültigen Zeilen im Blatt ZP-List');
                    const archiveName = archiveFileName(requestedAt ?? requestedAtFromText(fileName), fileName);
                    if (dryRun) {
                        log(`Probelauf ${subject}: ${entries.length} Zeilen, ${warnings.length} Warnung(en), Ablage als ${archiveName}`);
                        results.push({ messageId, subject, fileName, requestedAt, status: 'dry-run', rowCount: entries.length, warnings, archivedAs: archiveName });
                        continue;
                    }
                    const nextcloudPath = archive ? await archive(buffer, archiveName) : null;
                    const stored = await storePodlistImport(/** @type {import('pg').Pool} */ (db), {
                        source: 'mail',
                        fileName,
                        messageId,
                        requestedAt: requestedAt ?? requestedAtFromText(fileName),
                        nextcloudPath,
                        entries,
                    });
                    log(`Importiert ${subject}: ${stored.rowCount} Zeilen, ${stored.unknownCount} unbekannte Zählpunkte`);
                    results.push({ messageId, subject, fileName, requestedAt, status: 'imported', rowCount: stored.rowCount, unknownCount: stored.unknownCount, warnings, archivedAs: nextcloudPath });
                } catch (err) {
                    const error = err instanceof Error ? err.message : String(err);
                    log(`Fehler ${subject}: ${error}`);
                    if (!dryRun && db) await storePodlistFailure(db, { source: 'mail', fileName, messageId, requestedAt, error });
                    results.push({ messageId, subject, fileName, requestedAt, status: 'error', error });
                }
            }
        } finally {
            lock.release();
        }
    } finally {
        await client.logout().catch(() => {});
    }
    return results;
};

/**
 * Kurztext fuer Signal: nur Importe und Fehler, keine uebersprungenen Mails.
 * @param {MailResult[]} results
 * @returns {string | null} null, wenn nichts zu melden ist
 */
export const summarizeForSignal = (results) => {
    const lines = [];
    for (const r of results) {
        const when = r.requestedAt ? ` vom ${r.requestedAt}` : '';
        if (r.status === 'imported') {
            const unknown = r.unknownCount ? `, ${r.unknownCount} Zählpunkt(e) nicht in der Mitgliederliste` : '';
            const warn = r.warnings?.length ? `, ${r.warnings.length} Zeile(n) übersprungen` : '';
            lines.push(`Zählpunktliste${when} übernommen: ${r.rowCount} Zeilen${unknown}${warn}.`);
        } else if (r.status === 'error') {
            lines.push(`Zählpunktliste${when} nicht übernommen: ${r.error}`);
        }
    }
    if (!lines.length) return null;
    return `Podlist (${SUBJECT_MARKER})\n${lines.join('\n')}\nDetails: https://ischlstrom.org/board/members/import`;
};
