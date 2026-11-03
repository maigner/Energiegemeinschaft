// SvelteKit-Anbindung des Podlist-Imports: Cron in hooks.server.js (alle
// 10 Minuten) und Anzeige auf /board/members/import. Die Logik liegt in
// mailbox.js / sheet.js / db.js (ohne SvelteKit, auch fuer
// scripts/podlist-fetch.js).

import { env } from '$env/dynamic/private';
import { middlewareDbPool } from '$lib/server/db/db';
import { nextcloudClient } from '$lib/server/nextcloud/client';
import { signalConfigFromEnv, sendSignal } from '$lib/server/signal';
import { imapConfigFromEnv, fetchPodlistMails, summarizeForSignal } from './mailbox.js';
import { getPodlistStatus } from './db.js';

// Ablage neben dem Masterdata-Sheet; der Stammdaten-Import filtert dort auf
// Masterdata-Dateien und laesst die Podlists in Ruhe.
export const PODLIST_ARCHIVE_DIR = '/website/board/members/import';

let running = false;

/**
 * Cron: neue Podlist-Mails holen und importieren. Ohne IMAP_* in .env
 * passiert nichts. Laeuft nie doppelt.
 */
export const importPodlistMails = async () => {
    const config = imapConfigFromEnv(env);
    if (!config) return;
    if (running) {
        console.warn('[podlist] Lauf übersprungen, der vorige läuft noch');
        return;
    }
    running = true;
    try {
        const results = await fetchPodlistMails({
            config,
            db: middlewareDbPool,
            mailbox: env.IMAP_FOLDER || undefined,
            archive: archiveToNextcloud,
            log: (line) => console.log(`[podlist] ${line}`),
        });
        const text = summarizeForSignal(results);
        if (text) {
            await sendSignal(signalConfigFromEnv(env), text).catch((err) =>
                console.error('[podlist] Signal fehlgeschlagen:', err instanceof Error ? err.message : err)
            );
        }
    } catch (err) {
        console.error('[podlist] Lauf fehlgeschlagen:', err instanceof Error ? err.message : err);
    } finally {
        running = false;
    }
};

/**
 * Anhang in Nextcloud ablegen; eine vorhandene Datei gleichen Namens bleibt.
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {Promise<string | null>} Pfad in Nextcloud, null wenn die Ablage scheitert
 */
const archiveToNextcloud = async (buffer, fileName) => {
    const target = `${PODLIST_ARCHIVE_DIR}/${fileName}`;
    try {
        const nextcloud = nextcloudClient();
        if (!(await nextcloud.exists(target))) {
            await nextcloud.putFileContents(target, buffer, { overwrite: false });
        }
        return target;
    } catch (err) {
        // Die Ablage ist Komfort; der Import in die DB haengt nicht daran
        console.error('[podlist] Nextcloud-Ablage fehlgeschlagen:', err instanceof Error ? err.message : err);
        return null;
    }
};

/** Stand fuer die Import-Seite. */
export const podlistStatus = () => getPodlistStatus(middlewareDbPool);
