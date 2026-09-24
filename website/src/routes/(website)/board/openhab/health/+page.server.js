import { getFleetHealthPlants, getFleetHealthStats } from '$lib/server/db/members/openhabHealth';
import { getActiveFleetDischargeKw } from '$lib/server/db/members/openhabStatus';
import {
    getLatestForecastRun,
    getTodayChargeWindow,
    getTodayDischargeStart,
    getTodayDischargeEnd,
    getForecastDayCrossovers
} from '$lib/server/db/energy/forecast';
import { getCrossoverWeeks } from '$lib/server/db/energy/overview';
import { SYSTEM_METRICS } from '$lib/server/mail/notifications/ibmSystemAlerts';
import { plantChecks, fleetChecks } from '$lib/ibmHealth';

// Flotten-Gesundheit (/board/openhab/health): eine Matrix Anlage x
// Pruefung plus die Flottenpruefungen der Server-Seite. Die Bewertung
// selbst steht in $lib/ibmHealth.js; hier werden nur die Daten gesammelt.

/** Heutiges Datum und ISO-Kalenderwoche in Europe/Vienna. */
function todayVienna() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date());
    const get = (/** @type {string} */ t) => parts.find((p) => p.type === t)?.value ?? '';
    const today = `${get('year')}-${get('month')}-${get('day')}`;
    // ISO-Woche (wie EXTRACT(week ...) in Postgres, siehe getCurrentWeekCrossoverTime)
    const d = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
    const dayNr = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return { today, week };
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {
    const now = Date.now();
    const { today, week } = todayVienna();

    let serverIbmVersion = null;
    try {
        const r = await fetch('/ibm/VERSION');
        if (r.ok) {
            const v = (await r.text()).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(v)) serverIbmVersion = v;
        }
    } catch {
        serverIbmVersion = null;
    }

    const [plants, statsRows, run, crossoverWeeks] = await Promise.all([
        getFleetHealthPlants(),
        getFleetHealthStats().catch(() => []),
        getLatestForecastRun().catch(() => null),
        getCrossoverWeeks().catch(() => [])
    ]);
    const statsById = new Map(statsRows.map((/** @type {any} */ r) => [Number(r.id), r]));

    // Heutige Fenster der Token-API, so wie sie die Anlagen bekommen
    let windows = null;
    /** @type {Awaited<ReturnType<typeof getForecastDayCrossovers>>} */
    let forecastDays = [];
    if (run) {
        const [fenster, fleetKw, days] = await Promise.all([
            getTodayChargeWindow(run.id).catch(() => null),
            getActiveFleetDischargeKw().catch(() => 0),
            getForecastDayCrossovers(run.id, 14).catch(() => [])
        ]);
        forecastDays = days;
        if (fenster) {
            const [entladestart, entladeende] = await Promise.all([
                getTodayDischargeStart(run.id, fleetKw).catch(() => null),
                getTodayDischargeEnd(run.id, fleetKw).catch(() => null)
            ]);
            windows = {
                start: fenster.start ?? null,
                ende: fenster.ende ?? null,
                crossover: fenster.crossover_vormittag ?? null,
                entladestart,
                entladeende,
                fleetKw
            };
        }
    }
    const forecastRun = run ? {
        ageSeconds: Math.max(0, (now - new Date(run.created_at).getTime()) / 1000),
        dataUntil: run.data_until instanceof Date
            ? run.data_until.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : String(run.data_until ?? '')
    } : null;

    const ctx = { now, today, serverIbmVersion, systemMetrics: SYSTEM_METRICS };
    const rows = plants.map((/** @type {any} */ p) => {
        const { checks, worst } = plantChecks(p, statsById.get(Number(p.id)) ?? null, ctx);
        return {
            id: Number(p.id),
            name: p.name || 'ohne Namen',
            memberName: p.member_name,
            memberIdentifier: p.member_identifier,
            worst,
            checks
        };
    });

    const fleet = fleetChecks({ forecastRun, windows, crossoverWeeks, forecastDays, currentWeek: week, plants: rows });

    return {
        generatedAt: new Date(now).toISOString(),
        today,
        week,
        serverIbmVersion,
        fleet,
        plants: rows
    };
}
