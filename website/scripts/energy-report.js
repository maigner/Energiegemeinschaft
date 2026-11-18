#!/usr/bin/env node
// Monatlichen Energiebericht fuer ein Mitglied als Vorschau schreiben oder
// an eine Testadresse schicken - derselbe Code wie der Cron-Job der Website
// (src/lib/server/mail/reports/), aber ohne Versandprotokoll.
//
//   node scripts/energy-report.js --member 1 --out /tmp/bericht.html   (dazu .txt und .pdf)
//   node scripts/energy-report.js --member 1 --to test@example.org
//   node scripts/energy-report.js --member 1 --month 2026-07 --to ...
//   node scripts/energy-report.js --member 1 --to ... --bcc info@ischlstrom.org
//   node scripts/energy-report.js --member 1 --month 2026-10 --correction --to ...
//
// --correction rendert den Bericht so, wie ihn der Korrekturversand des Monats
// verschickt (Hinweis und Betreff aus reportCorrections.js).
//
// Ohne --month gilt der zuletzt abgeschlossene Monat. Zugangsdaten kommen wie
// bei `npm run dev` aus website/.env (also Produktivdaten von s1).
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from 'vite';
import pg from 'pg';
import nodemailer from 'nodemailer';
import { previousMonth, getReportMember, getMonthImportedAt } from '../src/lib/server/db/energy/monthlyReport.js';
import { loadCommunityReport, buildMemberReport } from '../src/lib/server/mail/reports/energyReportData.js';
import { renderEnergyReport } from '../src/lib/server/mail/reports/energyReportTemplate.js';
import { renderEnergyReportPdf } from '../src/lib/server/mail/reports/energyReportPdf.js';
import { correctionFor } from '../src/lib/server/mail/reports/reportCorrections.js';

const { values: args } = parseArgs({
    options: {
        member: { type: 'string' },
        month: { type: 'string' },
        to: { type: 'string' },
        bcc: { type: 'string' },
        out: { type: 'string' },
        correction: { type: 'boolean' },
    },
});

if (!args.member || (!args.to && !args.out)) {
    console.error('Aufruf: energy-report.js --member <nr> [--month YYYY-MM] [--correction] (--to <adresse> [--bcc <adresse>] | --out <datei.html>)');
    process.exit(1);
}
const month = args.month ?? previousMonth();
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    console.error(`Ungueltiger Monat: ${month}`);
    process.exit(1);
}

const correction = args.correction ? correctionFor(month) : null;
if (args.correction && !correction) {
    console.error(`Für ${month} ist in reportCorrections.js keine Korrektur eingetragen`);
    process.exit(1);
}

// loadEnv statt dotenv: liest .env genau so wie die Website selbst
const env = loadEnv('development', fileURLToPath(new URL('..', import.meta.url)), '');

const pool = new pg.Pool({
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

try {
    const member = await getReportMember(pool, Number(args.member));
    if (!member) throw new Error(`Mitglied ${args.member} nicht gefunden`);

    // Der Cron-Job verschickt nur nach einem Komplettimport des Monats; das CLI
    // sperrt nicht (Vorschau, Testversand), sagt aber, auf welchem Stand es rechnet.
    const importedAt = await getMonthImportedAt(pool, month).catch(() => null);
    console.error(importedAt
        ? `Komplettimport ${month}: ${importedAt.toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}`
        : `ACHTUNG: ${month} wurde noch nie komplett neu importiert (eegfaktura_import.py --month ${month}), Zahlen können veraltet sein`);

    const community = await loadCommunityReport(pool, month);
    const data = await buildMemberReport(pool, member, month, community);
    if (!data) throw new Error(`Mitglied ${args.member} hat im ${month} keine Messwerte`);
    if (correction) data.correction = { note: correction.note };

    const mail = renderEnergyReport(data, { pdfAttached: true });
    const pdf = await renderEnergyReportPdf(data);

    if (args.out) {
        writeFileSync(args.out, mail.html);
        writeFileSync(args.out.replace(/\.html?$/, '') + '.txt', mail.text);
        writeFileSync(args.out.replace(/\.html?$/, '') + '.pdf', pdf);
        console.log(`Vorschau geschrieben: ${args.out}`);
    }
    if (args.to) {
        const transporter = nodemailer.createTransport({
            host: env.SMTP_ENDPOINT,
            port: Number(env.SMTP_TLS_PORT),
            secure: true,
            auth: { user: env.SMTP_USER, pass: env.SMTP_PWD },
        });
        const info = await transporter.sendMail({
            from: '"EEG ISCHLSTROM" <info@ischlstrom.org>',
            to: args.to,
            bcc: args.bcc,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachments: [{ filename: mail.pdfFilename, content: pdf, contentType: 'application/pdf' }],
        });
        console.log(`Gesendet an ${args.to}: ${info.response}`);
    }
} catch (error) {
    console.error(error?.message ?? error);
    process.exitCode = 1;
} finally {
    await pool.end();
}
