// Cron-Job: Newsletter-Kontakte in Keila mit den Mitgliedern abgleichen
// (hooks.server.js, taeglich). Ohne KEILA_API_URL/KEILA_API_KEY in .env
// passiert nichts. Einzelheiten und Probelauf: newsletter/keila.js und
// scripts/keila-contacts.js.
import { env } from '$env/dynamic/private';
import { middlewareDbPool } from '$lib/server/db/db';
import { getNewsletterContacts } from '$lib/server/db/members/newsletter.js';
import { keilaConfigFromEnv, syncKeilaContacts } from './keila.js';

let running = false;

export async function syncNewsletterContacts() {
    const config = keilaConfigFromEnv(env);
    if (!config) return;
    if (running) return;
    running = true;
    try {
        const wanted = await getNewsletterContacts(middlewareDbPool);
        const result = await syncKeilaContacts(config, wanted, {
            log: (line) => console.log(`syncNewsletterContacts: ${line}`),
        });
        console.log(`syncNewsletterContacts: ${wanted.length} Mitglieder-Kontakte, `
            + `${result.created} angelegt, ${result.updated} aktualisiert, ${result.deleted} geloescht, `
            + `${result.unchanged} unveraendert, ${result.skipped} fremde Kontakte unangetastet`
            + (result.errors.length ? `, ${result.errors.length} Fehler` : ''));
        for (const error of result.errors) console.error(`syncNewsletterContacts: ${error}`);
    } catch (e) {
        console.error(`syncNewsletterContacts fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    } finally {
        running = false;
    }
}
