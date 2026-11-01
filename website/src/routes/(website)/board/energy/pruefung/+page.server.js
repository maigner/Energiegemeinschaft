import { fail } from '@sveltejs/kit';
import { middlewareDbPool } from '$lib/server/db/db';
import { env } from '$env/dynamic/private';
import { getBillingCheckRecord, setBillingCheckBilled, listBillingCheckRecords, noteBillingRequest } from '$lib/server/db/energy/billingCheck';
import { eegfakturaConfigFromEnv, sendSyncEnergy } from '$lib/server/eegfaktura/syncEnergy';
import { evaluatePeriod } from '$lib/server/mail/notifications/billingCheckAlerts';
import { periodFromParams, nachforderungText, quarterPeriod, todayVienna, lastFullQuarter, buildSyncRequest } from '$lib/billingCheck';

/** Die letzten acht Quartale fuer die Auswahl, das juengste volle zuerst. */
const quarterChoices = () => {
    const last = lastFullQuarter(todayVienna());
    const [y, m] = last.start.split('-').map(Number);
    let year = y;
    let quarter = Math.floor((m - 1) / 3) + 1;
    const choices = [];
    for (let i = 0; i < 8; i += 1) {
        const p = quarterPeriod(year, quarter);
        choices.push({ value: `${year}-Q${quarter}`, label: p.label, start: p.start, end: p.end });
        quarter -= 1;
        if (quarter === 0) {
            quarter = 4;
            year -= 1;
        }
    }
    return choices;
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ url }) {
    const params = {
        quartal: url.searchParams.get('quartal'),
        von: url.searchParams.get('von'),
        bis: url.searchParams.get('bis'),
    };
    const period = periodFromParams(params);
    const [evaluation, record, records] = await Promise.all([
        evaluatePeriod(period),
        getBillingCheckRecord(middlewareDbPool, period.start, period.end),
        listBillingCheckRecords(middlewareDbPool),
    ]);
    return {
        evaluation,
        nachforderung: nachforderungText(evaluation),
        record,
        records,
        quarters: quarterChoices(),
        selected: params,
    };
}

/** @type {import('./$types').Actions} */
export const actions = {
    billed: async ({ request }) => {
        const data = await request.formData();
        const start = String(data.get('start') ?? '');
        const end = String(data.get('end') ?? '');
        const billed = data.get('billed') === 'true';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return fail(400, { message: 'Zeitraum fehlt' });
        }
        await setBillingCheckBilled(middlewareDbPool, start, end, billed);
        return { ok: true };
    },

    // Nachforderung bei Netz OOe ueber EEG-Faktura: Token aus der
    // Browser-Anmeldung, Bereiche werden serverseitig aus dem aktuellen
    // Datenstand gebaut (nicht aus dem Formular). Das Token wird nicht gespeichert.
    nachforderung: async ({ request }) => {
        /** @type {import('$lib/server/eegfaktura/syncEnergy').SyncEnergyResult['skipped']} */
        const none = [];
        /** @param {string} error */
        const failed = (error) => ({ request: { ok: false, error, message: null, points: 0, requested: null, skipped: none } });
        const data = await request.formData();
        const start = String(data.get('start') ?? '');
        const end = String(data.get('end') ?? '');
        const token = String(data.get('token') ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return fail(400, failed('Zeitraum fehlt'));
        }
        if (data.get('confirm') !== 'on') {
            return fail(400, failed('Bitte das Senden bestätigen.'));
        }
        if (token.length < 20) {
            return fail(400, failed('Token fehlt (Authorization-Header aus der EEG-Faktura-Sitzung kopieren).'));
        }
        const period = periodFromParams({ von: start, bis: end });
        const evaluation = await evaluatePeriod(period);
        const body = buildSyncRequest(evaluation);
        if (!body) {
            return { request: { ok: true, error: null, message: 'Nichts anzufordern, es fehlen keine Tage.', points: 0, requested: 0, skipped: none } };
        }
        try {
            const result = await sendSyncEnergy(eegfakturaConfigFromEnv(env), token, body);
            await noteBillingRequest(middlewareDbPool, start, end, {
                at: new Date().toISOString(), points: body.meteringPoints.length, requested: result.requested, skipped: result.skipped.length,
            });
            return { request: { ok: true, error: null, message: null, points: body.meteringPoints.length, requested: result.requested, skipped: result.skipped } };
        } catch (err) {
            return fail(502, failed(err instanceof Error ? err.message : String(err)));
        }
    },
};
