import { getPublicIbmStats } from "$lib/server/db/members/openhabStatus";
import {
    getForecastNightDeficit,
    getLatestForecastRun,
} from "$lib/server/db/energy/forecast";
import { buildBatteryGoal } from "$lib/server/db/energy/batteryGoal";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    // Nur fuer die Speicherziel-Antwort; ohne Kennzahl bleibt die Antwort
    // allgemein, die Seite funktioniert also auch ohne Datenbank.
    const [ibm, run] = await Promise.all([
        getPublicIbmStats().catch(() => null),
        getLatestForecastRun().catch(() => null),
    ]);

    const deficit = run
        ? await getForecastNightDeficit(run.id).catch(() => null)
        : null;

    return {
        batteryGoal: buildBatteryGoal(deficit, ibm),
    };
}
