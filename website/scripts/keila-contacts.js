#!/usr/bin/env node
// Newsletter-Kontakte (Mitglieder mit aktivem Zaehlpunkt) als CSV fuer den
// Import in Keila schreiben oder direkt ueber die Keila-API abgleichen -
// derselbe Code wie der Cron-Job der Website (src/lib/server/newsletter/).
//
//   node scripts/keila-contacts.js --out kontakte.csv       CSV fuer Kontakte -> Importieren
//   node scripts/keila-contacts.js --sync --dry-run          zeigt, was der Abgleich taete
//   node scripts/keila-contacts.js --sync                    Abgleich ausfuehren
//   node scripts/keila-contacts.js --sync --delete-others    zusaetzlich alle Kontakte loeschen,
//                                                            die kein Mitglied mit aktivem
//                                                            Zaehlpunkt sind (auch von Hand angelegte)
//
// Zugangsdaten kommen wie bei `npm run dev` aus website/.env (Datenbank von
// s1, KEILA_API_URL und KEILA_API_KEY). Vom Entwicklungsrechner aus erreicht
// man Keila per `ssh -L 4000:127.0.0.1:4000 s1.ischlstrom.org` und
// KEILA_API_URL=http://127.0.0.1:4000.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from 'vite';
import pg from 'pg';
import { getNewsletterContacts } from '../src/lib/server/db/members/newsletter.js';
import { keilaConfigFromEnv, syncKeilaContacts, contactsToCsv } from '../src/lib/server/newsletter/keila.js';

const { values: args } = parseArgs({
    options: {
        out: { type: 'string' },
        sync: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        'delete-others': { type: 'boolean' },
    },
});
if (!args.out && !args.sync) {
    console.error('Aufruf: keila-contacts.js (--out <datei.csv> | --sync [--dry-run] [--delete-others])');
    process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...loadEnv('development', root, ''), ...process.env };

const pool = new pg.Pool({
    host: env.MIDDLEWARE_DB_HOST,
    port: Number(env.MIDDLEWARE_DB_PORT),
    database: env.MIDDLEWARE_DB_DATABASE,
    user: env.MIDDLEWARE_DB_USER,
    password: env.MIDDLEWARE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 1,
});

try {
    const contacts = await getNewsletterContacts(pool);
    const members = contacts.reduce((n, c) => n + c.data.mitgliedsnummern.length, 0);
    console.log(`${contacts.length} Kontakte (${members} Mitglieder mit aktivem Zaehlpunkt)`);

    if (args.out) {
        writeFileSync(args.out, contactsToCsv(contacts));
        console.log(`geschrieben: ${args.out}`);
    }
    if (args.sync) {
        const config = keilaConfigFromEnv(env);
        if (!config) throw new Error('KEILA_API_URL / KEILA_API_KEY nicht gesetzt');
        const result = await syncKeilaContacts(config, contacts, {
            dryRun: args['dry-run'], deleteOthers: args['delete-others'], log: console.log,
        });
        console.log(`${result.created} angelegt, ${result.updated} aktualisiert, ${result.deleted} geloescht, `
            + `${result.unchanged} unveraendert, ${result.skipped} fremde Kontakte unangetastet`);
        for (const error of result.errors) console.error(error);
        if (result.errors.length) process.exitCode = 1;
    }
} finally {
    await pool.end();
}
