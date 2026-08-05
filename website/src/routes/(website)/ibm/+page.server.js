import { getMemberCount } from "$lib/server/db/members/member";
import { getPublicIbmStats } from "$lib/server/db/members/openhabStatus";
import {
    getCommunityEnergyTotals,
    getCurrentWeekCrossoverTime,
} from "$lib/server/db/energy/overview";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    // Die Seite soll auch dann funktionieren, wenn eine der Kennzahlen
    // gerade nicht verfuegbar ist; fehlende Werte blendet die Seite aus.
    const [memberCount, ibm, energy, crossover] = await Promise.all([
        getMemberCount().catch(() => null),
        getPublicIbmStats().catch(() => null),
        getCommunityEnergyTotals().catch(() => null),
        getCurrentWeekCrossoverTime().catch(() => null),
    ]);

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
    };
}
