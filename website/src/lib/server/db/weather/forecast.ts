import { middlewareDbConnection } from "$lib/server/db/db";


/**
 * Stündliche Bewölkungsprognose (gesamt, tief, mittel, hoch in Prozent)
 * für heute und morgen, Tagesgrenzen in Europe/Vienna. Für den
 * Wolkenverlauf auf der Anlagen-Detailseite.
 */
export const getCloudForecast = async () => {
    const sql = await middlewareDbConnection();
    try {
        const result = await sql.query(`
            SELECT
                time,
                temperature_2m,
                cloud_cover,
                cloud_cover_low,
                cloud_cover_mid,
                cloud_cover_high
            FROM weather_weatherdata
            WHERE time >= date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') AT TIME ZONE 'Europe/Vienna'
              AND time < (date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') + INTERVAL '2 days') AT TIME ZONE 'Europe/Vienna'
            ORDER BY time ASC;
        `);
        return result.rows;
    } finally {
        sql.release();
    }
};

// Das Fenster wird in Server-Lokalzeit gebildet und ist nur korrekt, solange
// der Prozess mit TZ=Europe/Vienna laeuft (so im Docker-Container gesetzt) --
// die weather_weatherdata-Zeitstempel sind UTC-Instants (timestamptz).
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


/**
 * Stündliche Bewölkung vom Beginn der laufenden Stunde bis Mitternacht
 * (Lokalzeit Europe/Vienna). Für die dynamische Laderegelung der
 * IBM-Anlagen: die Steuerung gewichtet damit jede verbleibende Stunde bis
 * zur Abend-Deadline einzeln, statt mit einem einzigen Mittelwert zu
 * rechnen (der Mittelwert von getCloudForecastNextSunshineWindow gilt dem
 * jeweils nächsten Mittagsfenster und ab 12:00 damit dem morgigen Tag).
 */
export const getCloudForecastHoursToday = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            to_char(time AT TIME ZONE 'Europe/Vienna', 'HH24:MI') AS zeit,
            cloud_cover
        FROM weather_weatherdata
        WHERE time >= date_trunc('hour', now())
          AND (time AT TIME ZONE 'Europe/Vienna')::date = (now() AT TIME ZONE 'Europe/Vienna')::date
        ORDER BY time ASC;
    `);
    sql.release();
    return result?.rows ?? [];
};


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
