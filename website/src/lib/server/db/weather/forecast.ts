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
        WHERE time >= CURRENT_DATE - INTERVAL '7 days'
        AND time < CURRENT_DATE + INTERVAL '7 days'
        
        ORDER BY time ASC;
    `);
    /**
     * WHERE time >= CURRENT_DATE
        AND time < CURRENT_DATE + INTERVAL '14 days'
     */
    sql.release();
    return (result?.rows.length > 0 ? result?.rows : null);
};

export const getCloudForecast = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            time,
            temperature_2m,
            cloud_cover,
            cloud_cover_low,
            cloud_cover_mid,
            cloud_cover_high
        FROM weather_weatherdata
        WHERE time >= CURRENT_DATE
        AND time < CURRENT_DATE + INTERVAL '2 days'
        
        ORDER BY time ASC;
    `);
    /**
     * WHERE time >= CURRENT_DATE
        AND time < CURRENT_DATE + INTERVAL '14 days'
     */
    sql.release();
    return (result?.rows.length > 0 ? result?.rows : null);
};

function getNoonTimeWindow(): { start: Date; end: Date } {

    const date = new Date();

    // Set to noon today
    date.setHours(12, 0, 0, 0);

    // If the time is already past noon, move to noon tomorrow
    if (date <= new Date()) {
        date.setDate(date.getDate() + 1);
    }

    // Calculate start (2 hours before noon) and end (2 hours after noon)
    const start = new Date(date);
    start.setHours(10, 0, 0, 0); // 10:00 AM

    const end = new Date(date);
    end.setHours(14, 0, 0, 0); // 2:00 PM

    return { start, end };
}


export const getCloudForecastNextSunshineWindow = async () => {


    const { start, end } = getNoonTimeWindow();
    console.log('Noon window (local):', {
        start: start.toLocaleString(),
        end: end.toLocaleString()
    });
    console.log('Noon window (UTC):', { start, end });


    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            time,
            temperature_2m,
            cloud_cover,
            cloud_cover_low,
            cloud_cover_mid,
            cloud_cover_high
        FROM weather_weatherdata
        WHERE time >= $1
        AND time < $2        
        ORDER BY time ASC;
    `, [start, end]);
    /**
     * WHERE time >= CURRENT_DATE
        AND time < CURRENT_DATE + INTERVAL '14 days'
     */
    sql.release();
    return (result?.rows.length > 0 ? result?.rows : null);
};
