import { getMemberCount } from "$lib/server/db/members/member";
import { getPublicIbmStats } from "$lib/server/db/members/openhabStatus";
import { getCommunityEnergyTotals } from "$lib/server/db/energy/overview";
import {
    getForecastNightDeficit,
    getLatestForecastRun,
} from "$lib/server/db/energy/forecast";
import { buildBatteryGoal } from "$lib/server/db/energy/batteryGoal";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    // Die Startseite soll auch dann funktionieren, wenn eine der Kennzahlen
    // gerade nicht verfuegbar ist; fehlende Werte blendet die Seite aus.
    const [memberCount, ibm, energy, run] = await Promise.all([
        getMemberCount().catch(() => null),
        getPublicIbmStats().catch(() => null),
        getCommunityEnergyTotals().catch(() => null),
        getLatestForecastRun().catch(() => null),
    ]);

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
        batteryGoal: buildBatteryGoal(deficit, ibm),
    };
}
