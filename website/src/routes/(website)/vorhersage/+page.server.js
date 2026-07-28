import {
    getForecastAccuracy,
    getForecastDays,
    getForecastHours,
    getLatestForecastRun,
} from '$lib/server/db/energy/forecast';

export async function load() {
    const run = await getLatestForecastRun();

    if (!run) {
        return { run: null, hours: [], days: [], accuracy: [] };
    }

    const [hours, days, accuracy] = await Promise.all([
        getForecastHours(run.id, 7),
        getForecastDays(run.id, 10),
        getForecastAccuracy(21),
    ]);

    return { run, hours, days, accuracy };
}
