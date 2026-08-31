import { getMemberCount } from "$lib/server/db/members/member";
import { getPublicIbmStats } from "$lib/server/db/members/openhabStatus";
import {
    getCommunityEnergyTotals,
    getCurrentWeekCrossoverTime,
} from "$lib/server/db/energy/overview";
import {
    getForecastNightDeficit,
    getLatestForecastRun,
} from "$lib/server/db/energy/forecast";
import { buildBatteryGoal } from "$lib/server/db/energy/batteryGoal";
import { getBatteryGridFeedInByPlant } from "$lib/server/db/energy/batteryGridFeedIn";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    // Die Seite soll auch dann funktionieren, wenn eine der Kennzahlen
    // gerade nicht verfuegbar ist; fehlende Werte blendet die Seite aus.
    const [memberCount, ibm, energy, crossover, run, feedIn] = await Promise.all([
        getMemberCount().catch(() => null),
        getPublicIbmStats().catch(() => null),
        getCommunityEnergyTotals().catch(() => null),
        getCurrentWeekCrossoverTime().catch(() => null),
        getLatestForecastRun().catch(() => null),
        getBatteryGridFeedInByPlant().catch(() => null),
    ]);

    // Summe der Batterie-Netzeinspeisung ueber alle Anlagen (anonym, keine
    // Werte einzelner Anlagen) - dieselbe Rechnung wie im Dashboard.
    const batteryFeedIn =
        feedIn && feedIn.length > 0
            ? feedIn.reduce(
                  /**
                   * @param {{ week: number, month: number, total: number }} sum
                   * @param {{ week_kwh: number, month_kwh: number, total_kwh: number }} r
                   */
                  (sum, r) => ({
                      week: sum.week + Number(r.week_kwh ?? 0),
                      month: sum.month + Number(r.month_kwh ?? 0),
                      total: sum.total + Number(r.total_kwh ?? 0),
                  }),
                  { week: 0, month: 0, total: 0 }
              )
            : null;

    const deficit = run
        ? await getForecastNightDeficit(run.id).catch(() => null)
        : null;

    return {
        memberCount,
        ibm,
        selfUseKwh: energy?.self_use_kwh ? Number(energy.self_use_kwh) : null,
        firstYear: energy?.first_day
            ? new Date(energy.first_day).getFullYear()
            : null,
        eveningCrossover: crossover?.avg_evening_crossover
            ? String(crossover.avg_evening_crossover).slice(0, 5)
            : null,
        batteryGoal: buildBatteryGoal(deficit, ibm),
        batteryFeedIn,
    };
}
