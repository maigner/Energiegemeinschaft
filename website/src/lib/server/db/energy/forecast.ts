import { middlewareDbConnection } from "$lib/server/db/db";

/**
 * Energieprognose (notebooks/forecast/eeg_forecast.py).
 *
 * Die Prognose wird nicht hier gerechnet, sondern in Python nach jedem
 * EEG-Faktura-Import mit `eeg_forecast.py --store` in die Tabellen
 * metering_energyforecastrun / metering_energyforecast geschrieben. Hier wird
 * nur der jeweils neueste Lauf gelesen.
 */

/** Läufe, die rückwirkend nachgerechnet wurden, sind kein Echtbetrieb. */
const LIVE_RUN = "model_version NOT LIKE '%hindcast%'";

export const getLatestForecastRun = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT id, created_at, model_version, data_until, horizon_start, horizon_end, parameters
        FROM metering_energyforecastrun
        WHERE ${LIVE_RUN}
        ORDER BY created_at DESC
        LIMIT 1
    `);
    sql.release();
    return result?.rows?.[0] ?? null;
};

/**
 * Stundenwerte des Laufs -- die 15-Minuten-Auflösung ist für die Anzeige zu
 * fein (672 Punkte je Woche).
 */
export const getForecastHours = async (runId: number, days: number = 7) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            date_trunc('hour', timestamp AT TIME ZONE 'Europe/Vienna') AT TIME ZONE 'Europe/Vienna' AS hour,
            SUM(consumption_kwh) AS consumption_kwh,
            SUM(generation_kwh) AS generation_kwh,
            SUM(self_coverage_kwh) AS self_coverage_kwh,
            SUM(surplus_kwh) AS surplus_kwh,
            SUM(generation_kwh_p10) AS generation_kwh_p10,
            SUM(generation_kwh_p90) AS generation_kwh_p90
        FROM metering_energyforecast
        WHERE run_id = $1
          AND timestamp >= date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') AT TIME ZONE 'Europe/Vienna'
          AND timestamp < (date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') + ($2 || ' days')::interval) AT TIME ZONE 'Europe/Vienna'
        GROUP BY 1
        ORDER BY 1
    `, [runId, days]);
    sql.release();
    return result?.rows ?? [];
};

/** Tagessummen ab heute, für Tabelle und Kennzahlen. */
export const getForecastDays = async (runId: number, days: number = 10) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            (timestamp AT TIME ZONE 'Europe/Vienna')::date AS day,
            COUNT(*)::int AS intervals,
            SUM(consumption_kwh) AS consumption_kwh,
            SUM(generation_kwh) AS generation_kwh,
            SUM(self_coverage_kwh) AS self_coverage_kwh,
            SUM(surplus_kwh) AS surplus_kwh,
            MAX(n_consumption_points) AS n_consumption_points,
            MAX(n_generation_points) AS n_generation_points
        FROM metering_energyforecast
        WHERE run_id = $1
          AND (timestamp AT TIME ZONE 'Europe/Vienna')::date >= (now() AT TIME ZONE 'Europe/Vienna')::date
        GROUP BY 1
        HAVING COUNT(*) = 96
        ORDER BY 1
        LIMIT $2
    `, [runId, days]);
    sql.release();
    return result?.rows ?? [];
};

/**
 * Prognose gegen tatsächlich gemessene Werte, sobald der EEG-Faktura-Export sie
 * geliefert hat. Je Tag zählt der Lauf, der ihm am nächsten lag.
 *
 * Unvollständig gelieferte Tage sind über `actual_is_complete` in der View
 * bereits ausgeschlossen -- sie sähen sonst wie ein riesiger Prognosefehler aus.
 */
export const getForecastAccuracy = async (limit: number = 30) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT * FROM (
            SELECT DISTINCT ON (day)
                day, days_ahead, run_id, run_created_at, data_until, model_version,
                consumption_forecast::float AS consumption_forecast,
                consumption_actual::float AS consumption_actual,
                generation_forecast::float AS generation_forecast,
                generation_actual::float AS generation_actual,
                self_coverage_forecast::float AS self_coverage_forecast,
                self_coverage_actual::float AS self_coverage_actual
            FROM energy_forecast_vs_actual
            WHERE actual_is_complete
              AND intervals = 96
              AND consumption_actual IS NOT NULL
              AND days_ahead > 0
            ORDER BY day, days_ahead
        ) evaluated
        ORDER BY day DESC
        LIMIT $1
    `, [limit]);
    sql.release();
    return (result?.rows ?? []).reverse();
};
