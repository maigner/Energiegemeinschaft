// @ts-nocheck
// Cron-Job: monatlicher Energiebericht an die Mitglieder. Laeuft stuendlich
// tagsueber (hooks.server.js) und verschickt den Bericht des Vormonats,
// sobald die EEG-Faktura-Lieferung den Monat vollstaendig abdeckt (haengt
// einige Tage nach). members_energyreportlog sorgt dafuer, dass jedes
// Mitglied je Monat genau einen Bericht bekommt, auch ueber Neustarts und
// Fehlversuche hinweg.
//
// Ratenbegrenzung fuer den Mailserver: je Lauf hoechstens MAX_PER_RUN Mails
// mit SEND_PAUSE_MS Abstand; was uebrig bleibt, nimmt der naechste Lauf.
// Bei ~370 Mitgliedern und elf Laeufen am Tag ist der Vormonat an einem Tag
// durch, ohne dass mailcow und die Empfaenger-Provider einen Schwall sehen.
//
// Wer den Bericht bekommt, steuert ENERGY_REPORT_RECIPIENTS in website/.env:
//   nicht gesetzt        kein Versand
//   a@x.at,b@y.at        nur Mitglieder mit diesen Adressen (Testphase)
//   all                  alle Mitglieder mit aktivem Zaehlpunkt
// Vorschau und Einzelversand: website/scripts/energy-report.js
import { env } from '$env/dynamic/private';
import { middlewareDbPool } from '$lib/server/db/db';
import { relayMemberMail } from '$lib/server/mail/smtp';
import {
    previousMonth, isMonthComplete, getPendingReportRecipients, logReportSent,
} from '$lib/server/db/energy/monthlyReport.js';
import { loadCommunityReport, buildMemberReport } from './energyReportData.js';
import { renderEnergyReport } from './energyReportTemplate.js';
import { renderEnergyReportPdf } from './energyReportPdf.js';

// Pause zwischen zwei Mails und Obergrenze je Lauf (siehe oben)
const SEND_PAUSE_MS = 3000;
const MAX_PER_RUN = 40;

// Bleibt ein Tag dauerhaft unvollstaendig (Teil-Lieferung), geht der Bericht
// ab diesem Tag des Folgemonats trotzdem hinaus; die Abfragen lassen
// unvollstaendige Tage ohnehin weg.
const SEND_ANYWAY_FROM_DAY = 15;

const dayOfMonthVienna = () => Number(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vienna', day: 'numeric',
}).format(new Date()));

let running = false;

const recipientFilter = () => {
    const setting = (env.ENERGY_REPORT_RECIPIENTS ?? '').trim();
    if (!setting) return undefined;
    if (setting.toLowerCase() === 'all') return null;
    return setting.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
};

export async function sendMonthlyEnergyReports(month = previousMonth()) {
    const emails = recipientFilter();
    if (emails === undefined) return;
    if (running) return;
    running = true;

    try {
        const db = middlewareDbPool;
        const waitForData = month === previousMonth() && dayOfMonthVienna() < SEND_ANYWAY_FROM_DAY;
        if (waitForData && !(await isMonthComplete(db, month))) return;

        const recipients = await getPendingReportRecipients(db, month, emails);
        if (recipients.length === 0) return;

        console.log(`sendMonthlyEnergyReports ${month}: ${recipients.length} offen, max. ${MAX_PER_RUN} in diesem Lauf`);
        const community = await loadCommunityReport(db, month);

        let sent = 0;
        for (const member of recipients) {
            if (sent >= MAX_PER_RUN) break;
            try {
                const data = await buildMemberReport(db, member, month, community);
                if (data) {
                    const mail = renderEnergyReport(data, { pdfAttached: true });
                    const pdf = await renderEnergyReportPdf(data);
                    await relayMemberMail(member.email.trim(), mail.subject, mail.html, mail.text, [
                        { filename: mail.pdfFilename, content: pdf, contentType: 'application/pdf' },
                    ]);
                    sent++;
                }
                // auch Mitglieder ohne Messwerte protokollieren, sonst prueft
                // der Job sie bis zum Monatsende jeden Tag neu
                await logReportSent(db, member.identifier, month, data ? member.email.trim() : '');
                if (data) await new Promise((resolve) => setTimeout(resolve, SEND_PAUSE_MS));
            } catch (error) {
                // keine Adresse loggen, nur die Mitgliedsnummer
                console.error(`energy report ${month} for member ${member.identifier} failed:`, error?.message ?? error);
            }
        }
        console.log(`sendMonthlyEnergyReports ${month}: ${sent} gesendet, ${Math.max(0, recipients.length - sent)} verbleiben`);
    } catch (error) {
        console.error('sendMonthlyEnergyReports failed:', error?.message ?? error);
    } finally {
        running = false;
    }
}
