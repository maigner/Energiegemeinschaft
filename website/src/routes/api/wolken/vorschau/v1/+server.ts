import { getCloudForecastNextSunshineWindow, getCloudForecastHoursToday } from '$lib/server/db/weather/forecast.js';
import { json } from '@sveltejs/kit';

function getAverageCloudCover(forecast: Array<{ cloud_cover: number }>): number {
    const sum = forecast.reduce((acc, entry) => acc + entry.cloud_cover, 0);
    return sum / forecast.length;
}

/** @type {import('../../$types').RequestHandler} */
export async function GET(event) {

    console.log("public weather api called");

    const forecast = await getCloudForecastNextSunshineWindow();

    // Ohne Daten kein Wert: 0 wuerde von den openHAB-Clients als "0 % Wolken"
    // (voller Sonnenschein) gelesen und die aggressivste Steuerung ausloesen.
    if (!forecast || forecast.length === 0) {
        return json(
            { error: "Für das nächste Sonnenfenster liegen keine Wetterdaten vor" },
            { status: 404 }
        );
    }

    const averageCloudCover = getAverageCloudCover(forecast);
    console.log(averageCloudCover); // e.g., 94.0

    // Stundenwerte fuer den Rest des heutigen Tages (dynamische Laderegelung
    // der IBM-Anlagen). `vorschau` bleibt das naechste Mittagsfenster - die
    // naechtliche Entladung braucht genau das. Aeltere Clients ignorieren
    // die Zusatzfelder einfach.
    const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' })
        .format(new Date());
    const stunden = (await getCloudForecastHoursToday() ?? [])
        .map((row: any) => ({ zeit: String(row.zeit), wolken: Number(row.cloud_cover) }))
        .filter((s: any) => /^\d{2}:\d{2}$/.test(s.zeit)
            && Number.isFinite(s.wolken) && s.wolken >= 0 && s.wolken <= 100);

    return json(
        { wolken: { vorschau: averageCloudCover, datum: heute, stunden } }
    );

}
