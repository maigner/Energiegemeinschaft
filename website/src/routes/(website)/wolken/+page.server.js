
import { getCloudForecast } from '$lib/server/db/weather/forecast.js';

export async function load({ params, parent }) {




    return {
        forecast: await getCloudForecast(),
    }


}

