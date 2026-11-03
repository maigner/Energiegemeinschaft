// Abrechnungspruefung als Cron (hooks.server.js, taeglich 06:10 nach dem
// Energiedaten-Import um 05:00): bewertet das letzte volle Quartal, solange
// es nicht als abgerechnet markiert ist, und meldet per Signal nur, wenn
// sich der Befund gegenueber dem gespeicherten Fingerabdruck geaendert hat;
// ab 14 Tagen nach Quartalsende zusaetzlich woechentlich eine Erinnerung,
// solange die Pruefung nicht gruen ist. Seite: /board/energy/pruefung.

import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { middlewareDbPool } from '$lib/server/db/db';
import { signalConfigFromEnv, sendSignal } from '$lib/server/signal';
import {
    getPointChecks, getPeriodTotals, getActivationSources, getBillingCheckRecord, saveBillingCheckRecord,
} from '$lib/server/db/energy/billingCheck';
import {
    evaluate, lastFullQuarter, todayVienna, findingsFingerprint, signalSummary, REMINDER_DAYS_AFTER_PERIOD,
} from '$lib/billingCheck';

const REMINDER_INTERVAL_DAYS = 7;

/**
 * Bewertung eines Zeitraums aus der DB (auch fuer die Seite).
 * @param {{ start: string, end: string, label: string }} period
 */
export const evaluatePeriod = async (period) => {
    const [points, totals, activation] = await Promise.all([
        getPointChecks(middlewareDbPool, period.start, period.end),
        getPeriodTotals(middlewareDbPool, period.start, period.end),
        getActivationSources(middlewareDbPool),
    ]);
    return evaluate({ period, points, totals, activation });
};

/** @param {string} a JJJJ-MM-TT @param {string} b JJJJ-MM-TT */
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const checkBillingReadiness = async () => {
    try {
        const today = todayVienna();
        const period = lastFullQuarter(today);
        const record = await getBillingCheckRecord(middlewareDbPool, period.start, period.end);
        if (record?.billedAt) return;

        const evaluation = await evaluatePeriod(period);
        const fingerprint = createHash('sha256').update(findingsFingerprint(evaluation)).digest('hex');
        const changed = fingerprint !== (record?.findingsHash ?? null);
        const daysSinceEnd = daysBetween(period.end, today);
        const lastNotified = record?.notifiedAt ? daysBetween(record.notifiedAt.slice(0, 10), today) : Infinity;
        const reminderDue = evaluation.overall !== 'gruen'
            && daysSinceEnd >= REMINDER_DAYS_AFTER_PERIOD
            && lastNotified >= REMINDER_INTERVAL_DAYS;

        let notified = false;
        if (changed || reminderDue) {
            const text = signalSummary(evaluation, { reminder: !changed });
            notified = await sendSignal(signalConfigFromEnv(env), text).catch((err) => {
                console.error('[billing-check] Signal fehlgeschlagen:', err instanceof Error ? err.message : err);
                return false;
            });
            console.log(`[billing-check] ${period.label}: ${evaluation.overall}, ${changed ? 'Befund geändert' : 'Erinnerung'}${notified ? ', Signal gesendet' : ''}`);
        }
        await saveBillingCheckRecord(middlewareDbPool, {
            periodStart: period.start,
            periodEnd: period.end,
            findingsHash: fingerprint,
            summary: { overall: evaluation.overall, counts: evaluation.counts, allocationOk: evaluation.totals.allocationOk,
                       mismatches: evaluation.activation.mismatches.length, missingInPodlist: evaluation.activation.missingInPodlist.length },
            notified,
        });
    } catch (err) {
        console.error('[billing-check] Lauf fehlgeschlagen:', err instanceof Error ? err.message : err);
    }
};
