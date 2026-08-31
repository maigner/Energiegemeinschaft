import { middlewareDbConnection } from "$lib/server/db/db";

// Netzeinspeisung aus der Batterie je Anlage, auf Basis des kumulierten
// Einspeisezaehlers des Pi (batterie_netz_kwh aus den Status-Pushes,
// integriert in Batteriemanagement/openhab/control/core.js aus
// min(Batterie-Entladung, Netzeinspeisung)). Der Pi weiss im Gegensatz zum
// Netzzaehler, wann die Batterie entlaedt - auch in der Daemmerung, wenn
// PV und Batterie gleichzeitig einspeisen. Gezaehlt wird erst seit
// Inbetriebnahme der Anlagen; aeltere Nachteinspeisung bleibt bewusst
// unberuecksichtigt.
//
// Damit Wochen-, Monats- und Gesamtsummen das 30-Tage-Pruning des
// Status-Verlaufs ueberleben, rollt ein taeglicher Cron (hooks.server.js,
// vor pruneOpenhabStatusHistory) den letzten Zaehlerstand jedes Tages nach
// members_openhabcountersnapshot (Django-Modell OpenhabCounterSnapshot).
// Summiert werden positive Tagesdeltas: ein Zaehlerreset (SD-Karte neu
// aufgesetzt, Item verloren) zeigt sich als Sprung nach unten und zaehlt
// ab 0 weiter, verfaelscht die Summen also nicht.

// Nur Zahlen aus dem Status-JSON akzeptieren
const NUMERIC = `'^[0-9]+(\\.[0-9]+)?$'`;

/**
 * Summen je Anlage (members_openhabstatus.id): aktuelle Kalenderwoche,
 * aktueller Monat und gesamt, jeweils in kWh. Tagesdeltas aus den
 * Schnappschuessen plus das Delta des laufenden Tages aus dem live
 * gemeldeten Zaehlerstand. Anlagen ohne Zaehler (kein Batteriemanagement
 * oder altes IBM-Paket) fehlen im Ergebnis.
 *
 * @returns {Promise<{ plant_id: number, week_kwh: number, month_kwh: number, total_kwh: number }[]>}
 */
export const getBatteryGridFeedInByPlant = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(`
            WITH snaps AS (
                SELECT status_id, day, battery_grid_kwh AS kwh,
                       lag(battery_grid_kwh) OVER (PARTITION BY status_id ORDER BY day) AS prev
                FROM members_openhabcountersnapshot
            ), deltas AS (
                SELECT status_id, day,
                       CASE WHEN prev IS NULL THEN kwh          -- erster Tag: Zaehler begann bei 0
                            WHEN kwh >= prev THEN kwh - prev
                            ELSE kwh END AS delta               -- Reset: ab 0 weitergezaehlt
                FROM snaps
            ), agg AS (
                SELECT status_id,
                       sum(delta) FILTER (WHERE day >= date_trunc('week',  (now() AT TIME ZONE 'Europe/Vienna'))::date) AS week_kwh,
                       sum(delta) FILTER (WHERE day >= date_trunc('month', (now() AT TIME ZONE 'Europe/Vienna'))::date) AS month_kwh,
                       sum(delta) AS total_kwh
                FROM deltas
                GROUP BY status_id
            ), latest AS (
                SELECT DISTINCT ON (status_id) status_id, battery_grid_kwh AS kwh
                FROM members_openhabcountersnapshot
                ORDER BY status_id, day DESC
            ), live AS (
                -- Energie des laufenden Tages: aktueller Zaehlerstand minus
                -- letzter Schnappschuss (bei Reset: aktueller Stand)
                SELECT os.id AS status_id,
                       CASE WHEN os.data->>'batterie_netz_kwh' !~ ${NUMERIC} THEN NULL
                            WHEN l.kwh IS NULL THEN (os.data->>'batterie_netz_kwh')::float
                            WHEN (os.data->>'batterie_netz_kwh')::float >= l.kwh
                                THEN (os.data->>'batterie_netz_kwh')::float - l.kwh
                            ELSE (os.data->>'batterie_netz_kwh')::float END AS delta
                FROM members_openhabstatus os
                LEFT JOIN latest l ON l.status_id = os.id
            )
            SELECT os.id AS plant_id,
                   COALESCE(agg.week_kwh,  0) + COALESCE(lv.delta, 0) AS week_kwh,
                   COALESCE(agg.month_kwh, 0) + COALESCE(lv.delta, 0) AS month_kwh,
                   COALESCE(agg.total_kwh, 0) + COALESCE(lv.delta, 0) AS total_kwh
            FROM members_openhabstatus os
            LEFT JOIN agg ON agg.status_id = os.id
            LEFT JOIN live lv ON lv.status_id = os.id
            WHERE agg.total_kwh IS NOT NULL OR lv.delta IS NOT NULL
        `);
        return result.rows;
    } finally {
        db.release();
    }
};

/**
 * Wochen- und Monatssumme fuer eine einzelne Anlage - dieselbe Rechnung wie
 * getBatteryGridFeedInByPlant, gefiltert auf eine status_id. Geht mit der
 * Antwort auf die Statusmeldung an den Pi, damit die Main UI der Anlage
 * exakt die Dashboard-Werte zeigt (der Pi kennt seine eigene Historie vor
 * der Baseline nicht). null, wenn die Anlage keinen Zaehler meldet und
 * keine Schnappschuesse hat.
 *
 * @param {number} statusId
 * @returns {Promise<{ week_kwh: number, month_kwh: number } | null>}
 */
export const getBatteryGridFeedInForPlant = async (statusId) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(`
            WITH snaps AS (
                SELECT day, battery_grid_kwh AS kwh,
                       lag(battery_grid_kwh) OVER (ORDER BY day) AS prev
                FROM members_openhabcountersnapshot
                WHERE status_id = $1
            ), deltas AS (
                SELECT day,
                       CASE WHEN prev IS NULL THEN kwh
                            WHEN kwh >= prev THEN kwh - prev
                            ELSE kwh END AS delta
                FROM snaps
            ), agg AS (
                SELECT sum(delta) FILTER (WHERE day >= date_trunc('week',  (now() AT TIME ZONE 'Europe/Vienna'))::date) AS week_kwh,
                       sum(delta) FILTER (WHERE day >= date_trunc('month', (now() AT TIME ZONE 'Europe/Vienna'))::date) AS month_kwh,
                       count(*) AS days
                FROM deltas
            ), latest AS (
                SELECT battery_grid_kwh AS kwh
                FROM members_openhabcountersnapshot
                WHERE status_id = $1
                ORDER BY day DESC
                LIMIT 1
            ), live AS (
                SELECT CASE WHEN os.data->>'batterie_netz_kwh' !~ ${NUMERIC} THEN NULL
                            WHEN l.kwh IS NULL THEN (os.data->>'batterie_netz_kwh')::float
                            WHEN (os.data->>'batterie_netz_kwh')::float >= l.kwh
                                THEN (os.data->>'batterie_netz_kwh')::float - l.kwh
                            ELSE (os.data->>'batterie_netz_kwh')::float END AS delta
                FROM members_openhabstatus os
                LEFT JOIN latest l ON true
                WHERE os.id = $1
            )
            SELECT COALESCE(agg.week_kwh,  0) + COALESCE(lv.delta, 0) AS week_kwh,
                   COALESCE(agg.month_kwh, 0) + COALESCE(lv.delta, 0) AS month_kwh,
                   (COALESCE(agg.days, 0) > 0 OR lv.delta IS NOT NULL) AS has_data
            FROM agg
            LEFT JOIN live lv ON true
        `, [statusId]);
        const row = result.rows[0];
        if (!row || !row.has_data) return null;
        return { week_kwh: Number(row.week_kwh), month_kwh: Number(row.month_kwh) };
    } finally {
        db.release();
    }
};

/**
 * Rollt den letzten Zaehlerstand jedes abgeschlossenen Tages aus
 * members_openhabstatushistory in die Schnappschuss-Tabelle (idempotent,
 * Upsert). Muss vor pruneOpenhabStatusHistory laufen, sonst gehen Tage
 * verloren; der laufende Tag wird ausgelassen (noch nicht abgeschlossen).
 */
export const rollupOpenhabCounterSnapshots = async () => {
    const db = await middlewareDbConnection();
    try {
        await db.query(`
            INSERT INTO members_openhabcountersnapshot (status_id, day, battery_grid_kwh)
            SELECT DISTINCT ON (h.status_id, (h.time AT TIME ZONE 'Europe/Vienna')::date)
                   h.status_id,
                   (h.time AT TIME ZONE 'Europe/Vienna')::date,
                   (h.data->>'batterie_netz_kwh')::float
            FROM members_openhabstatushistory h
            WHERE h.data->>'batterie_netz_kwh' ~ ${NUMERIC}
              AND (h.time AT TIME ZONE 'Europe/Vienna')::date < (now() AT TIME ZONE 'Europe/Vienna')::date
            ORDER BY h.status_id, (h.time AT TIME ZONE 'Europe/Vienna')::date, h.time DESC
            ON CONFLICT (status_id, day) DO UPDATE SET battery_grid_kwh = EXCLUDED.battery_grid_kwh
        `);
    } finally {
        db.release();
    }
};
