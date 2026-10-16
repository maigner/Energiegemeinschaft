import { middlewareDbConnection } from "$lib/server/db/db";
import { SNAPSHOT_DELTAS, historyIncrements } from "./batteryGridFeedInSql.js";

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
// vor pruneOpenhabStatusHistory) jeden abgeschlossenen Tag nach
// members_openhabcountersnapshot (Django-Modell OpenhabCounterSnapshot):
// den letzten Zaehlerstand des Tages und die Tagesenergie als Summe der
// plausiblen Zuwaechse zwischen den Status-Pushes (batteryGridFeedInSql.js).
// Ein Zaehlerrueckfall (SD-Karte neu aufgesetzt, Item verloren, mapdb aus
// dem zram wiederhergestellt) ist damit keine Energie, sondern nur ein
// Zuwachs von 0; gezaehlt wird ab dem naechsten Push weiter.

const WEEK_START = `date_trunc('week',  (now() AT TIME ZONE 'Europe/Vienna'))::date`;
const MONTH_START = `date_trunc('month', (now() AT TIME ZONE 'Europe/Vienna'))::date`;

// Summen je Anlage: abgeschlossene Tage aus den Schnappschuessen plus die
// noch nicht gerollten Tage (heute; nach einem Cron-Ausfall auch gestern)
// live aus der History. Das History-Fenster ist bewusst kurz - die Abfrage
// laeuft bei jeder vollen Statusmeldung (alle 5 Minuten je Anlage).
/** @param {string | null} plantFilter SQL-Ausdruck fuer die status_id (z. B. '$1::int') oder null fuer alle */
const sumsSql = (plantFilter) => `
    WITH ${SNAPSHOT_DELTAS},
    ${historyIncrements(`time >= now() - interval '3 days'${plantFilter ? ` AND status_id = ${plantFilter}` : ''}`)},
    agg AS (
        SELECT status_id,
               sum(delta) FILTER (WHERE day >= ${WEEK_START}) AS week_kwh,
               sum(delta) FILTER (WHERE day >= ${MONTH_START}) AS month_kwh,
               sum(delta) AS total_kwh,
               max(day) AS last_day
        FROM snapshot_deltas
        ${plantFilter ? `WHERE status_id = ${plantFilter}` : ''}
        GROUP BY status_id
    ), live AS (
        SELECT hi.status_id,
               sum(hi.delta) FILTER (WHERE hi.day >= ${WEEK_START}) AS week_kwh,
               sum(hi.delta) FILTER (WHERE hi.day >= ${MONTH_START}) AS month_kwh,
               sum(hi.delta) AS total_kwh
        FROM history_increments hi
        LEFT JOIN agg ON agg.status_id = hi.status_id
        WHERE agg.last_day IS NULL OR hi.day > agg.last_day
        GROUP BY hi.status_id
    )
    SELECT os.id AS plant_id,
           COALESCE(agg.week_kwh,  0) + COALESCE(lv.week_kwh,  0) AS week_kwh,
           COALESCE(agg.month_kwh, 0) + COALESCE(lv.month_kwh, 0) AS month_kwh,
           COALESCE(agg.total_kwh, 0) + COALESCE(lv.total_kwh, 0) AS total_kwh
    FROM members_openhabstatus os
    LEFT JOIN agg ON agg.status_id = os.id
    LEFT JOIN live lv ON lv.status_id = os.id
    WHERE (agg.status_id IS NOT NULL OR lv.status_id IS NOT NULL)
      ${plantFilter ? `AND os.id = ${plantFilter}` : ''}
`;

/**
 * Summen je Anlage (members_openhabstatus.id): aktuelle Kalenderwoche,
 * aktueller Monat und gesamt, jeweils in kWh. Anlagen ohne Zaehler (kein
 * Batteriemanagement oder altes IBM-Paket) fehlen im Ergebnis.
 *
 * @returns {Promise<{ plant_id: number, week_kwh: number, month_kwh: number, total_kwh: number }[]>}
 */
export const getBatteryGridFeedInByPlant = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(sumsSql(null));
        return result.rows.map(toNumbers);
    } finally {
        db.release();
    }
};

/**
 * Wochen-, Monats- und Gesamtsumme fuer eine einzelne Anlage - dieselbe
 * Rechnung wie getBatteryGridFeedInByPlant, gefiltert auf eine status_id.
 * Geht mit der Antwort auf die Statusmeldung an den Pi, damit die Main UI
 * der Anlage exakt die Dashboard-Werte zeigt (der lokale Zaehler kennt
 * weder die Historie vor seiner Baseline noch uebersteht er jeden
 * Neustart). null, wenn die Anlage keinen Zaehler meldet und keine
 * Schnappschuesse hat.
 *
 * @param {number} statusId
 * @returns {Promise<{ week_kwh: number, month_kwh: number, total_kwh: number } | null>}
 */
export const getBatteryGridFeedInForPlant = async (statusId) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(sumsSql('$1::int'), [statusId]);
        const row = result.rows[0];
        if (!row) return null;
        const { week_kwh, month_kwh, total_kwh } = toNumbers(row);
        return { week_kwh, month_kwh, total_kwh };
    } finally {
        db.release();
    }
};

/** @param {Record<string, unknown>} row */
const toNumbers = (row) => ({
    plant_id: Number(row.plant_id),
    week_kwh: Number(row.week_kwh),
    month_kwh: Number(row.month_kwh),
    total_kwh: Number(row.total_kwh),
});

/**
 * Rollt jeden abgeschlossenen Tag aus members_openhabstatushistory in die
 * Schnappschuss-Tabelle (idempotent, Upsert): letzter Zaehlerstand des
 * Tages und Tagesenergie aus den plausiblen Zuwaechsen. Muss vor
 * pruneOpenhabStatusHistory laufen, sonst gehen Tage verloren; der
 * laufende Tag wird ausgelassen (noch nicht abgeschlossen).
 *
 * Ein einmal geschriebenes Tagesdelta bleibt stehen: der aelteste Tag im
 * History-Fenster verliert nach dem Pruning seinen ersten Zuwachs, ein
 * spaeterer Lauf wuerde ihn also nur verkleinern. Zeilen ohne Delta (vor
 * Migration 0040) bekommen es nachgetragen, solange die History den Tag
 * noch abdeckt.
 */
export const rollupOpenhabCounterSnapshots = async () => {
    const db = await middlewareDbConnection();
    try {
        await db.query(`
            WITH ${historyIncrements()}
            INSERT INTO members_openhabcountersnapshot (status_id, day, battery_grid_kwh, battery_grid_delta_kwh)
            SELECT status_id, day,
                   (array_agg(kwh ORDER BY time DESC))[1],
                   round(sum(delta)::numeric, 3)
            FROM history_increments
            WHERE day < (now() AT TIME ZONE 'Europe/Vienna')::date
            GROUP BY status_id, day
            ON CONFLICT (status_id, day) DO UPDATE
                SET battery_grid_kwh = EXCLUDED.battery_grid_kwh,
                    battery_grid_delta_kwh = COALESCE(members_openhabcountersnapshot.battery_grid_delta_kwh,
                                                      EXCLUDED.battery_grid_delta_kwh)
        `);
    } finally {
        db.release();
    }
};
