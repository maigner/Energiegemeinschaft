// SQL-Bausteine fuer die Netzeinspeisung aus der Batterie (Einspeise-Zaehler
// des Pi, batterie_netz_kwh aus den Status-Pushes). Ohne Imports, damit die
// Berichts-CLI (scripts/energy-report.js) sie ohne SvelteKit laden kann.
//
// Warum nicht einfach "Tagesendstand minus Vortag"? Der Zaehler auf dem Pi
// liegt in mapdb, und mapdb lag auf den Pis bis Oktober 2026 im zram: nach
// einem Stromausfall kam der Stand des letzten sauberen Herunterfahrens
// zurueck, Wochen alt (pi-020, 2026-10-09: 36 -> 12 kWh). Ein solcher
// Rueckfall ist kein Reset auf 0, und der alte Trick "ab 0 weiterzaehlen"
// hat den wiederhergestellten Altstand als 12 kWh Tagesenergie verbucht.
// Deshalb zaehlt die Website nur noch die Zuwaechse zwischen zwei
// aufeinanderfolgenden Status-Pushes, und nur solche, die physikalisch
// moeglich sind: ein Rueckgang ist 0, ein Sprung ueber MAX_FEED_IN_KW mal
// die verstrichene Zeit ebenfalls (Wiederherstellung, Neuaufsetzen).

/** Regex fuer Zahlen im Status-JSON (Postgres-Literal). */
export const NUMERIC = `'^[0-9]+(\\.[0-9]+)?$'`;

/**
 * Hoechste plausible Einspeiseleistung aus der Batterie in kW. core.js
 * begrenzt die forcierte Entladung auf ABSOLUTE_MAX_DISCHARGE_W (5 kW);
 * der doppelte Wert laesst Luft fuer grosse Anlagen und Push-Luecken.
 */
export const MAX_FEED_IN_KW = 10;

/**
 * CTE `history_increments`: Zuwachs des Zaehlers je Status-Push (kWh),
 * zugeordnet zum Wiener Kalendertag des Pushes. Der erste Push im Fenster
 * hat keinen Vorgaenger und zaehlt 0.
 *
 * @param {string} [where] zusaetzliche Einschraenkung der History (SQL)
 */
export const historyIncrements = (where) => `
    history_increments AS (
        SELECT status_id, time, kwh,
               (time AT TIME ZONE 'Europe/Vienna')::date AS day,
               CASE WHEN prev IS NULL OR kwh < prev THEN 0
                    WHEN kwh - prev > ${MAX_FEED_IN_KW} * extract(epoch FROM (time - prev_time)) / 3600 + 0.02 THEN 0
                    ELSE kwh - prev END AS delta
        FROM (SELECT status_id, time,
                     (data->>'batterie_netz_kwh')::float AS kwh,
                     lag((data->>'batterie_netz_kwh')::float) OVER (PARTITION BY status_id ORDER BY time) AS prev,
                     lag(time) OVER (PARTITION BY status_id ORDER BY time) AS prev_time
              FROM members_openhabstatushistory
              WHERE data->>'batterie_netz_kwh' ~ ${NUMERIC}${where ? ` AND ${where}` : ''}) h
    )`;

/**
 * CTE `snapshot_deltas`: Tagesenergie je Anlage aus den Schnappschuessen
 * (members_openhabcountersnapshot). Massgeblich ist battery_grid_delta_kwh
 * (Summe der plausiblen Zuwaechse des Tages, seit Migration 0040); fuer
 * aeltere Zeilen ohne Delta bleibt die alte Rechnung Tagesendstand minus
 * Vortag (erster Tag und Rueckgang: ab 0).
 */
export const SNAPSHOT_DELTAS = `
    snapshot_deltas AS (
        SELECT status_id, day,
               COALESCE(delta_kwh,
                        CASE WHEN prev IS NULL THEN kwh
                             WHEN kwh >= prev THEN kwh - prev
                             ELSE kwh END) AS delta
        FROM (SELECT status_id, day,
                     battery_grid_kwh AS kwh,
                     battery_grid_delta_kwh AS delta_kwh,
                     lag(battery_grid_kwh) OVER (PARTITION BY status_id ORDER BY day) AS prev
              FROM members_openhabcountersnapshot) s
    )`;
