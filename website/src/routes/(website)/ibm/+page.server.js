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

// Annahmen fuer die Hochrechnung "wie viele Batterien braucht die Nacht":
// rund die Haelfte der Kapazitaet steht am Abend fuer die Gemeinschaft zur
// Verfuegung (Mindest-Ladestand plus Vorrang des eigenen Haushalts), und eine
// weitere Batterie entspricht dem Durchschnitt der schon gemeldeten Anlagen
// (bzw. 10 kWh, solange noch keine Kapazitaeten gemeldet sind).
const USABLE_SHARE = 0.5;
const DEFAULT_BATTERY_KWH = 10;

/**
 * Fortschritt zum Ziel "die Nacht aus Batterien decken", aus dem
 * durchschnittlichen Nachtbedarf der Energieprognose (/vorhersage) und der
 * aktuell gemeldeten Batterieflotte.
 *
 * @param {{days: number, avg_night_deficit_kwh: number} | null} deficit
 * @param {{plants: number, capacity_kwh: number} | null} ibm
 */
const buildBatteryGoal = (deficit, ibm) => {
    if (!deficit?.avg_night_deficit_kwh) return null;
    const nightKwh = deficit.avg_night_deficit_kwh;
    const plants = ibm?.plants ?? 0;
    const capacityKwh = ibm?.capacity_kwh ?? 0;
    const avgBatteryKwh =
        plants > 0 && capacityKwh > 0
            ? capacityKwh / plants
            : DEFAULT_BATTERY_KWH;
    const usableFleetKwh = capacityKwh * USABLE_SHARE;
    const missingKwh = Math.max(0, nightKwh - usableFleetKwh);
    return {
        nightKwh,
        forecastDays: deficit.days,
        plants,
        usableFleetKwh,
        usableShare: USABLE_SHARE,
        avgBatteryKwh,
        additionalBatteries: Math.ceil(
            missingKwh / (avgBatteryKwh * USABLE_SHARE),
        ),
        progressPercent: Math.min(
            100,
            Math.round((usableFleetKwh / nightKwh) * 100),
        ),
    };
};

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    // Die Seite soll auch dann funktionieren, wenn eine der Kennzahlen
    // gerade nicht verfuegbar ist; fehlende Werte blendet die Seite aus.
    const [memberCount, ibm, energy, crossover, run] = await Promise.all([
        getMemberCount().catch(() => null),
        getPublicIbmStats().catch(() => null),
        getCommunityEnergyTotals().catch(() => null),
        getCurrentWeekCrossoverTime().catch(() => null),
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
        eveningCrossover: crossover?.avg_evening_crossover
            ? String(crossover.avg_evening_crossover).slice(0, 5)
            : null,
        batteryGoal: buildBatteryGoal(deficit, ibm),
    };
}
