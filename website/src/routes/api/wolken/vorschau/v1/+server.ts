import { getCloudForecastNextSunshineWindow } from '$lib/server/db/weather/forecast.js';
import { json } from '@sveltejs/kit';

function getAverageCloudCover(forecast: Array<{ cloud_cover: number }>): number {
    if (!forecast || forecast.length === 0) return 0;

    const sum = forecast.reduce((acc, entry) => acc + entry.cloud_cover, 0);
    return sum / forecast.length;
}

/** @type {import('../../$types').RequestHandler} */
export async function GET(event) {

    console.log("public weather api called");


    const forecast = await getCloudForecastNextSunshineWindow();
    const averageCloudCover = getAverageCloudCover(forecast);
    console.log(averageCloudCover); // e.g., 94.0


    return json(
        averageCloudCover
    );

}