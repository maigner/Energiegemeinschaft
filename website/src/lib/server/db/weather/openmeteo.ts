import { fetchWeatherApi } from 'openmeteo';
import { middlewareDbConnection } from "$lib/server/db/db";

export async function fetchAndStoreWeatherData() {
    // 1. Fetch from Open-Meteo
    const params = {
        latitude: 47.7111,
        longitude: 13.6189,
        hourly: [
            'temperature_2m', 'cloud_cover', 'rain', 'snowfall',
            'snow_depth_water_equivalent', 'cloud_cover_low', 'cloud_cover_mid',
            'cloud_cover_high', 'relative_humidity_2m', 'dew_point_2m'
        ],
        forecast_days: 3,
        models: 'geosphere_arome_austria',
    };

    const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', params);
    const response = responses[0];
    const utcOffsetSeconds = response.utcOffsetSeconds();
    const hourly = response.hourly();

    if (hourly === null) {
        console.error('No hourly data received from Open-Meteo');
        return;
    }

    const times = Array.from(
        { length: (Number(hourly.timeEnd()) - Number(hourly.time())) / hourly.interval() },
        (_, i) => new Date((Number(hourly.time()) + i * hourly.interval() + utcOffsetSeconds) * 1000)
    );

    const rows = times.map((time, i) => [
        time,
        hourly.variables(0).valuesArray()[i],  // temperature_2m
        hourly.variables(1).valuesArray()[i],  // cloud_cover
        hourly.variables(2).valuesArray()[i],  // rain
        hourly.variables(3).valuesArray()[i],  // snowfall
        hourly.variables(4).valuesArray()[i],  // snow_depth_water_equivalent
        hourly.variables(5).valuesArray()[i],  // cloud_cover_low
        hourly.variables(6).valuesArray()[i],  // cloud_cover_mid
        hourly.variables(7).valuesArray()[i],  // cloud_cover_high
        hourly.variables(8).valuesArray()[i],  // relative_humidity_2m
        hourly.variables(9).valuesArray()[i],  // dew_point_2m
    ]);

    // 2. Build unnest-based upsert (most efficient with pg for bulk inserts)
    const times_arr = rows.map(r => r[0]);
    const temperature_2m_arr = rows.map(r => r[1]);
    const cloud_cover_arr = rows.map(r => r[2]);
    const rain_arr = rows.map(r => r[3]);
    const snowfall_arr = rows.map(r => r[4]);
    const snow_depth_arr = rows.map(r => r[5]);
    const cloud_cover_low_arr = rows.map(r => r[6]);
    const cloud_cover_mid_arr = rows.map(r => r[7]);
    const cloud_cover_high_arr = rows.map(r => r[8]);
    const humidity_arr = rows.map(r => r[9]);
    const dew_point_arr = rows.map(r => r[10]);

    // 3. Upsert
    const sql = await middlewareDbConnection();
    try {
        await sql.query(`
      INSERT INTO weather_weatherdata (
        time, temperature_2m, cloud_cover, rain, snowfall, snow_depth,
        cloud_cover_low, cloud_cover_mid, cloud_cover_high,
        relative_humidity_2m, dew_point_2m
      )
      SELECT
        UNNEST($1::timestamptz[]),
        UNNEST($2::float[]),
        UNNEST($3::float[]),
        UNNEST($4::float[]),
        UNNEST($5::float[]),
        UNNEST($6::float[]),
        UNNEST($7::float[]),
        UNNEST($8::float[]),
        UNNEST($9::float[]),
        UNNEST($10::float[]),
        UNNEST($11::float[])
      ON CONFLICT (time) DO UPDATE SET
        temperature_2m       = EXCLUDED.temperature_2m,
        cloud_cover          = EXCLUDED.cloud_cover,
        rain                 = EXCLUDED.rain,
        snowfall             = EXCLUDED.snowfall,
        snow_depth           = EXCLUDED.snow_depth,
        cloud_cover_low      = EXCLUDED.cloud_cover_low,
        cloud_cover_mid      = EXCLUDED.cloud_cover_mid,
        cloud_cover_high     = EXCLUDED.cloud_cover_high,
        relative_humidity_2m = EXCLUDED.relative_humidity_2m,
        dew_point_2m         = EXCLUDED.dew_point_2m
    `, [
            times_arr, temperature_2m_arr, cloud_cover_arr, rain_arr, snowfall_arr,
            snow_depth_arr, cloud_cover_low_arr, cloud_cover_mid_arr, cloud_cover_high_arr,
            humidity_arr, dew_point_arr
        ]);

        console.log(`[weather] Upserted ${rows.length} rows`);
    } catch (error) {
        console.error('[weather] Error occurred while upserting data:', error);
    } finally {
        sql.release();
    }
}