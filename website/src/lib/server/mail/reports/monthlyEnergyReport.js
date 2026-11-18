// @ts-nocheck
// Cron-Job: monatlicher Energiebericht an die Mitglieder. Laeuft stuendlich
// tagsueber (hooks.server.js) und verschickt den Bericht des Vormonats,
// sobald die EEG-Faktura-Lieferung den Monat vollstaendig abdeckt (haengt
// einige Tage nach). members_energyreportlog sorgt dafuer, dass jedes
// Mitglied je Monat genau einen Bericht bekommt, auch ueber Neustarts und
// Fehlversuche hinweg.
//
// Vor dem Versand muss der Berichtsmonat einmal komplett neu aus EEG-Faktura
// geholt sein (Vermerk in metering_monthimport, importAllowsSending in
// monthlyReport.js): der Import auf s1 holt dafuer um 05:00 den ganzen
// Vormonat, solange noch kein Bericht hinausgegangen ist. Ohne Vermerk von
// heute beginnt der Versand nicht; von Hand gibt
// `eegfaktura_import.py --month YYYY-MM` einen Monat frei.
//
// Ratenbegrenzung fuer den Mailserver: je Lauf hoechstens MAX_PER_RUN Mails
// mit SEND_PAUSE_MS Abstand; was uebrig bleibt, nimmt der naechste Lauf.
// Bei ~370 Mitgliedern und elf Laeufen am Tag ist der Vormonat an einem Tag
// durch, ohne dass mailcow und die Empfaenger-Provider einen Schwall sehen.
//
// Korrekturversand: Monate in reportCorrections.js gehen noch einmal an alle,
// die den Bericht vor dem dort genannten Zeitpunkt bekommen haben, mit einem
// Hinweis im Bericht und "Korrektur:" im Betreff. Derselbe Lauf, dasselbe
// Ratenlimit (regulaere Berichte zuerst), je Mitglied genau einmal
// (members_energyreportlog.correction_sent_at).
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
    getMonthImportedAt, hasReportLog, importAllowsSending,
    getPendingCorrectionRecipients, logCorrectionSent,
} from '$lib/server/db/energy/monthlyReport.js';
import { REPORT_CORRECTIONS } from './reportCorrections.js';
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

/**
 * Bericht bauen und verschicken. false, wenn das Mitglied im Monat keine
 * Messwerte hat (dann geht nichts hinaus).
 * @param {{ note: string } | null} [correction]  Hinweis des Korrekturversands
 */
async function deliver(db, member, month, community, correction = null) {
    const data = await buildMemberReport(db, member, month, community);
    if (!data) return false;
    if (correction) data.correction = { note: correction.note };
    const mail = renderEnergyReport(data, { pdfAttached: true });
    const pdf = await renderEnergyReportPdf(data);
    await relayMemberMail(member.email.trim(), mail.subject, mail.html, mail.text, [
        { filename: mail.pdfFilename, content: pdf, contentType: 'application/pdf' },
    ]);
    return true;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, SEND_PAUSE_MS));

/** Regulaerer Versand des Monats; liefert die Zahl der verschickten Mails. */
async function sendReports(db, month, emails) {
    const waitForData = month === previousMonth() && dayOfMonthVienna() < SEND_ANYWAY_FROM_DAY;
    if (waitForData && !(await isMonthComplete(db, month))) return 0;

    const recipients = await getPendingReportRecipients(db, month, emails);
    if (recipients.length === 0) return 0;

    const importState = {
        importedAt: await getMonthImportedAt(db, month),
        started: await hasReportLog(db, month),
    };
    if (!importAllowsSending(importState)) {
        console.log(`sendMonthlyEnergyReports ${month}: ${recipients.length} offen, wartet auf den Komplettimport des Monats`);
        return 0;
    }

    console.log(`sendMonthlyEnergyReports ${month}: ${recipients.length} offen, max. ${MAX_PER_RUN} in diesem Lauf`);
    const community = await loadCommunityReport(db, month);

    let sent = 0;
    for (const member of recipients) {
        if (sent >= MAX_PER_RUN) break;
        try {
            const delivered = await deliver(db, member, month, community);
            if (delivered) sent++;
            // auch Mitglieder ohne Messwerte protokollieren, sonst prueft
            // der Job sie bis zum Monatsende jeden Tag neu
            await logReportSent(db, member.identifier, month, delivered ? member.email.trim() : '');
            if (delivered) await pause();
        } catch (error) {
            // keine Adresse loggen, nur die Mitgliedsnummer
            console.error(`energy report ${month} for member ${member.identifier} failed:`, error?.message ?? error);
        }
    }
    console.log(`sendMonthlyEnergyReports ${month}: ${sent} gesendet, ${Math.max(0, recipients.length - sent)} verbleiben`);
    return sent;
}

/**
 * Korrekturversand (reportCorrections.js) mit dem Rest des Laufbudgets.
 * Auch hier gilt: ohne Komplettimport des Monats geht nichts hinaus.
 */
async function sendCorrections(db, emails, budget) {
    for (const [month, correction] of Object.entries(REPORT_CORRECTIONS)) {
        if (budget <= 0) return;
        const recipients = await getPendingCorrectionRecipients(db, month, correction, emails);
        if (recipients.length === 0) continue;
        if (!(await getMonthImportedAt(db, month))) {
            console.log(`sendMonthlyEnergyReports Korrektur ${month}: ${recipients.length} offen, wartet auf den Komplettimport des Monats`);
            continue;
        }

        console.log(`sendMonthlyEnergyReports Korrektur ${month}: ${recipients.length} offen, max. ${budget} in diesem Lauf`);
        const community = await loadCommunityReport(db, month);

        let sent = 0;
        for (const member of recipients) {
            if (sent >= budget) break;
            try {
                const delivered = await deliver(db, member, month, community, correction);
                if (delivered) sent++;
                await logCorrectionSent(db, member.identifier, month);
                if (delivered) await pause();
            } catch (error) {
                console.error(`energy report correction ${month} for member ${member.identifier} failed:`, error?.message ?? error);
            }
        }
        budget -= sent;
        console.log(`sendMonthlyEnergyReports Korrektur ${month}: ${sent} gesendet, ${Math.max(0, recipients.length - sent)} verbleiben`);
    }
}

export async function sendMonthlyEnergyReports(month = previousMonth()) {
    const emails = recipientFilter();
    if (emails === undefined) return;
    if (running) return;
    running = true;

    try {
        const db = middlewareDbPool;
        const sent = await sendReports(db, month, emails);
        await sendCorrections(db, emails, MAX_PER_RUN - sent);
    } catch (error) {
        console.error('sendMonthlyEnergyReports failed:', error?.message ?? error);
    } finally {
        running = false;
    }
}
