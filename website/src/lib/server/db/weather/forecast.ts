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

/**
 * Lokales Datum (Europe/Vienna, `YYYY-MM-DD`) des nächsten Mittagsfensters:
 * heute vor 12:00, sonst morgen. Derselbe Tag, für den `vorschau` von
 * `/api/wolken/vorschau/v1` die Bewölkung mittelt.
 */
export const getNextSunshineWindowDate = () => {
    const { start } = getNoonTimeWindow();
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(start);
};

/**
 * Erwarteter Ertrag eines Tages als Anteil an einem guten Tag, für die
 * Nachtreserve der IBM-Anlagen: die prognostizierte Tagessumme der
 * Globalstrahlung (`shortwave_radiation`, Wh/m²) geteilt durch das
 * 75. Perzentil der Tagessummen der 14 Vortage -- dieselbe Normierung wie
 * das Sonnenprofil am Gateway (je Stunde das 75. Perzentil der letzten
 * 14 Tage). Anders als die Bewölkung bildet die Strahlungsprognose auch
 * Hochnebel und Regentage ab, an denen "80 % Wolken" real 3 % Ertrag
 * bedeuten. null, wenn der Tag nicht vollständig (24 Stunden) vorliegt oder
 * die Vortage fehlen. `anteil` ist ungekappt (über 1 an einem Tag, der
 * besser ist als die Vortage); das Gateway kappt selbst bei 1.
 */
export const getRadiationShareForDay = async (datum: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
    const sql = await middlewareDbConnection();
    try {
        const result = await sql.query(`
            WITH tage AS (
                SELECT (time AT TIME ZONE 'Europe/Vienna')::date AS d,
                       sum(shortwave_radiation) / 1000.0 AS kwh,
                       count(*) AS n
                FROM weather_weatherdata
                WHERE time >= (($1::date - 14)::timestamp AT TIME ZONE 'Europe/Vienna')
                  AND time <  (($1::date + 1)::timestamp AT TIME ZONE 'Europe/Vienna')
                GROUP BY 1
            )
            SELECT
                (SELECT kwh FROM tage WHERE d = $1::date AND n >= 24) AS prognose,
                (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY kwh)
                   FROM tage WHERE d < $1::date AND n >= 24) AS gut,
                (SELECT count(*) FROM tage WHERE d < $1::date AND n >= 24)::int AS vortage
        `, [datum]);
        const row = result?.rows?.[0];
        const prognose = Number(row?.prognose);
        const gut = Number(row?.gut);
        const vortage = Number(row?.vortage);
        if (!Number.isFinite(prognose) || !Number.isFinite(gut) || gut <= 0 || vortage < 7) return null;
        return {
            datum,
            anteil: Math.round(prognose / gut * 100) / 100,
            prognose_kwh_m2: Math.round(prognose * 100) / 100,
            gut_kwh_m2: Math.round(gut * 100) / 100
        };
    } finally {
        sql.release();
    }
};
