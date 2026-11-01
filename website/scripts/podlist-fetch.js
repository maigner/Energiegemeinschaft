#!/usr/bin/env node
// Podlist-Import ohne SvelteKit: dieselben Module wie der Cron der Website
// (src/lib/server/podlist/), zum Testen und fuer den Import einer Datei von
// Hand.
//
//   node scripts/podlist-fetch.js --dry-run                      Postfach lesen, nichts schreiben
//   node scripts/podlist-fetch.js --dry-run --imap-env .env.s1   IMAP_* aus einer anderen Datei
//   IMAP_HOST=mail.example.org node scripts/podlist-fetch.js ...   Shell-Umgebung gewinnt
//   node scripts/podlist-fetch.js                                 holen und in die DB schreiben
//   node scripts/podlist-fetch.js --file ~/Downloads/RC101533_20261101-1028_ZP_PODLIST.xlsx [--dry-run]
//
// DB wie bei `npm run dev` aus website/.env (Produktivdaten von s1). Die
// Ablage in Nextcloud macht nur der Cron der Website, nicht dieses Skript.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from 'vite';
import pg from 'pg';
import { parsePodlistSheet, requestedAtFromText } from '../src/lib/server/podlist/sheet.js';
import { storePodlistImport } from '../src/lib/server/podlist/db.js';
import { imapConfigFromEnv, fetchPodlistMails, summarizeForSignal } from '../src/lib/server/podlist/mailbox.js';

const { values: args } = parseArgs({
    options: {
        'dry-run': { type: 'boolean', default: false },
        'imap-env': { type: 'string' },
        file: { type: 'string' },
        mailbox: { type: 'string' },
        'since-days': { type: 'string' },
    },
});
const dryRun = args['dry-run'];
const websiteDir = fileURLToPath(new URL('..', import.meta.url));

// loadEnv statt dotenv: liest .env genau so wie die Website selbst
const env = loadEnv('development', websiteDir, '');
if (args['imap-env']) {
    // nur die IMAP_*-Zeilen aus der anderen Datei (z. B. .env.s1), damit die
    // DB-Zugangsdaten die der lokalen .env bleiben
    for (const raw of readFileSync(args['imap-env'], 'utf8').split('\n')) {
        const m = /^\s*(IMAP_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(raw);
        if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
}
// Shell-Umgebung gewinnt (z. B. IMAP_HOST=mail.example.org node scripts/podlist-fetch.js ...)
for (const key of Object.keys(process.env)) {
    if (key.startsWith('IMAP_') && process.env[key]) env[key] = /** @type {string} */ (process.env[key]);
}

const makePool = () =>
    new pg.Pool({
        host: env.MIDDLEWARE_DB_HOST,
        port: Number(env.MIDDLEWARE_DB_PORT),
        database: env.MIDDLEWARE_DB_DATABASE,
        user: env.MIDDLEWARE_DB_USER,
        password: env.MIDDLEWARE_DB_PASSWORD,
        // wie src/lib/server/db/db.js: mit DB_SSL_SERVERNAME/DB_SSL_CA wird das Serverzertifikat geprueft
        ssl: (env.DB_SSL_CA || env.DB_SSL_SERVERNAME)
            ? { rejectUnauthorized: true, ...(env.DB_SSL_CA ? { ca: readFileSync(env.DB_SSL_CA, 'utf8') } : {}), ...(env.DB_SSL_SERVERNAME ? { servername: env.DB_SSL_SERVERNAME } : {}) }
            : { rejectUnauthorized: false },
        max: 1,
    });

const log = (/** @type {string} */ line) => console.log(line);
let exitCode = 0;

if (args.file) {
    const buffer = readFileSync(args.file);
    const { entries, warnings } = parsePodlistSheet(buffer);
    const fileName = args.file.split('/').pop() ?? args.file;
    const requestedAt = requestedAtFromText(fileName);
    const identifiers = new Set(entries.map((e) => e.identifier));
    log(`${fileName}: ${entries.length} Zeilen, ${identifiers.size} Zählpunkte, Anforderung ${requestedAt ?? 'unbekannt'}`);
    for (const w of warnings) log(`  Warnung: ${w}`);
    if (!dryRun) {
        const pool = makePool();
        try {
            const stored = await storePodlistImport(pool, { source: 'file', fileName, requestedAt, entries });
            log(`Import #${stored.id}: ${stored.rowCount} Zeilen, ${stored.unknownCount} Zählpunkte nicht in members_measurementpoint`);
        } finally {
            await pool.end();
        }
    }
} else {
    const config = imapConfigFromEnv(env);
    if (!config) {
        console.error('IMAP_HOST, IMAP_USER und IMAP_PASSWORD fehlen (website/.env oder --imap-env <datei>)');
        process.exit(1);
    }
    log(`IMAP ${config.user}@${config.host}:${config.port}${dryRun ? ' (Probelauf)' : ''}`);
    const pool = dryRun ? null : makePool();
    try {
        const results = await fetchPodlistMails({
            config,
            db: pool,
            mailbox: args.mailbox || env.IMAP_FOLDER || undefined,
            sinceDays: args['since-days'] ? Number(args['since-days']) : undefined,
            dryRun,
            log,
        });
        for (const r of results) {
            log(`  ${r.status.padEnd(8)} ${r.subject}  ${r.fileName}${r.rowCount != null ? `  ${r.rowCount} Zeilen` : ''}${r.error ? `  ${r.error}` : ''}`);
            for (const w of r.warnings ?? []) log(`           Warnung: ${w}`);
        }
        const text = summarizeForSignal(results);
        if (text) log(`\nSignal-Text:\n${text}`);
        if (results.some((r) => r.status === 'error')) exitCode = 1;
    } finally {
        await pool?.end();
    }
}
process.exit(exitCode);
