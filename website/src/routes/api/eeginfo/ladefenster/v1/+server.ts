import { getLatestForecastRun, getTodayChargeWindow } from '$lib/server/db/energy/forecast';
import { json } from '@sveltejs/kit';

/**
 * Ladesperre-Fenster für das Batteriemanagement (IBM), abgeleitet aus der
 * Tagesprognose (siehe getTodayChargeWindow): morgens die PV der Gemeinschaft
 * überlassen, die Batterie erst aus dem Mittags-Überschuss laden.
 *
 * Antwort: { ladefenster: { datum, start, ende } } -- start/ende "HH:MM" in
 * Europe/Vienna, beides null, wenn für heute keine Sperre vorgesehen ist
 * (kein erwarteter Überschuss bzw. keine Erzeugung).
 */
/** @type {import('./$types').RequestHandler} */
export async function GET(event) {

    console.log("public ladefenster api called");

    const run = await getLatestForecastRun();
    if (!run) {
        return json(
            { error: "Es liegt keine Energieprognose vor" },
            { status: 404 }
        );
    }

    const fenster = await getTodayChargeWindow(run.id);
    if (!fenster) {
        return json(
            { error: "Für heute liegt keine Energieprognose vor" },
            { status: 404 }
        );
    }

    return json({
        ladefenster: {
            datum: fenster.datum,
            start: fenster.start,
            ende: fenster.ende
        }
    });

}
