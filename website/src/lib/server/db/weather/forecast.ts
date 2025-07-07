import { middlewareDbConnection } from "$lib/server/db/db";


export const getForecast = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            time,
            temperature_2m,
            cloud_cover,
            rain,
            snowfall,
            snow_depth,
            cloud_cover_low,
            cloud_cover_mid,
            cloud_cover_high,
            relative_humidity_2m,
            dew_point_2m
        FROM weather_weatherdata
        
        ORDER BY time ASC;
    `);
    /**
     * WHERE time >= CURRENT_DATE
        AND time < CURRENT_DATE + INTERVAL '14 days'
     */
    sql.release();
    return (result?.rows.length > 0 ? result?.rows : null);
};
