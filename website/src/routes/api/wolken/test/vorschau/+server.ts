
import { getCloudForecast } from '$lib/server/db/weather/forecast.js';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function GET(event) {

    console.log("public weather api called");
    


    const forcast = await getCloudForecast();

    return json(
        forcast
    );

}