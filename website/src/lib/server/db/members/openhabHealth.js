import { middlewareDbConnection } from "$lib/server/db/db";

// Datenbasis der Flotten-Gesundheitsseite (/board/openhab/health): der
// letzte Stand jeder Anlage samt Tunnel-Handshake und Alarmspalten sowie
// Kennzahlen aus dem Status-Verlauf der letzten Tage (Nachtverhalten,
// Meldeluecken, Neustarts, Netzladung, Einspeisung). Die Bewertung
// (ok/warn/crit) macht $lib/ibmHealth.js ohne Datenbank, damit sie
// nachvollziehbar und testbar bleibt.

/**
 * Alle Anlagen mit dem, was die Gesundheitsbewertung braucht. Geloeschte
 * (setup_phase 'geloescht', warten auf den s1-Timer) bleiben aussen vor.
 */
export const getFleetHealthPlants = async () => {
    const db = await middlewareDbConnection();
    try {
        // Bis Migration 0038 auf der Datenbank ist, gibt es die Spalte
        // wg_handshake_at nicht - die Seite zeigt den Tunnel dann als unbekannt.
        const col = await db.query(
            `SELECT 1 FROM information_schema.columns
              WHERE table_name = 'members_openhabstatus' AND column_name = 'wg_handshake_at'`
        );
        const handshake = col.rowCount
            ? `s.wg_handshake_at, EXTRACT(EPOCH FROM (now() - s.wg_handshake_at)) AS handshake_age_seconds,`
            : `NULL::timestamptz AS wg_handshake_at, NULL::float AS handshake_age_seconds,`;
        const result = await db.query(
            `SELECT s.id,
                    s.name,
                    s.last_seen,
                    EXTRACT(EPOCH FROM (now() - s.last_seen)) AS age_seconds,
                    s.data,
                    s.inverter_type,
                    s.setup_phase,
                    s.wg_address,
                    s.wg_public_key <> '' AS wg_configured,
                    ${handshake}
                    s.update_requested_at,
                    s.offline_alerted_at,
                    s.system_alerts,
                    m.name AS member_name,
                    m.identifier AS member_identifier
               FROM members_openhabstatus s
               JOIN members_member m ON s.member_id = m.id
              WHERE COALESCE(s.setup_phase, '') <> 'geloescht'
              ORDER BY s.name, s.id`
        );
        return result.rows;
    } finally {
        db.release();
    }
};

/**
 * Kennzahlen je Anlage aus dem Status-Verlauf (nur volle Meldungen, alle
 * 5 Minuten) der letzten sieben Tage und den Zaehler-Schnappschuessen:
 *
 *   pushes_24h            Meldungen der letzten 24 h (Soll: 288)
 *   boots_7d              verschiedene Boot-Zeitpunkte in 7 Tagen (1 = kein Neustart)
 *   netzladung_7d         Zyklen mit erkannter Netto-Netzladung in 7 Tagen
 *   below_min_7d          Zyklen in 7 Tagen, in denen die Anlage unter ihrem
 *                         Mindest-Ladestand noch ins Netz eingespeist hat
 *   night_min_soc_feeding tiefster Ladestand waehrend der Einspeisung der
 *                         letzten Nacht (gestern 16:00 bis heute 10:00)
 *   night_feed_hours      Stunden mit Einspeisung > 200 W in dieser Nacht
 *   night_below_min_kwh   davon unter dem Mindest-Ladestand eingespeist (kWh)
 *   night_feed_kwh        eingespeiste Energie dieser Nacht (aus den 5-min-Werten)
 *   soc_evening           Ladestand gestern um 19:00, soc_morning heute um 06:00
 *   feed_7d_kwh           Batterie-Netzeinspeisung der letzten 7 Tage (Zaehler-Deltas)
 *
 * Alles null, wenn keine Daten vorliegen.
 */
export const getFleetHealthStats = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `WITH h AS (
                SELECT status_id,
                       time,
                       time AT TIME ZONE 'Europe/Vienna' AS lt,
                       CASE WHEN jsonb_typeof(data->'soc') = 'number' THEN (data->>'soc')::float END AS soc,
                       CASE WHEN jsonb_typeof(data->'netzeinspeisung_w') = 'number' THEN (data->>'netzeinspeisung_w')::float ELSE 0 END AS einsp,
                       CASE WHEN jsonb_typeof(data->'min_battery_charge') = 'number' THEN (data->>'min_battery_charge')::float END AS min_soc,
                       CASE WHEN jsonb_typeof(data->'netzladung_w') = 'number' THEN (data->>'netzladung_w')::float ELSE 0 END AS netzladung,
                       data->'system'->>'booted_at' AS booted
                  FROM members_openhabstatushistory
                 WHERE time >= now() - interval '7 days'
            ), today AS (
                SELECT date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') AS d
            ), night AS (
                SELECT h.* FROM h, today
                 WHERE h.lt >= today.d - interval '8 hours'
                   AND h.lt <  today.d + interval '10 hours'
            ), snaps AS (
                SELECT status_id, day, battery_grid_kwh AS kwh,
                       lag(battery_grid_kwh) OVER (PARTITION BY status_id ORDER BY day) AS prev
                  FROM members_openhabcountersnapshot
                 WHERE day >= current_date - 8
            ), feed AS (
                SELECT status_id,
                       sum(CASE WHEN prev IS NULL THEN 0
                                WHEN kwh >= prev THEN kwh - prev
                                ELSE kwh END) FILTER (WHERE day >= current_date - 7) AS kwh_7d
                  FROM snaps
                 GROUP BY status_id
            )
            SELECT s.id,
                   (SELECT count(*) FROM h WHERE h.status_id = s.id AND h.time >= now() - interval '24 hours')::int AS pushes_24h,
                   (SELECT count(DISTINCT booted) FROM h WHERE h.status_id = s.id AND booted IS NOT NULL)::int AS boots_7d,
                   (SELECT count(*) FROM h WHERE h.status_id = s.id AND netzladung > 0)::int AS netzladung_7d,
                   (SELECT count(*) FROM h WHERE h.status_id = s.id AND einsp > 200 AND soc IS NOT NULL
                                             AND min_soc IS NOT NULL AND soc < min_soc - 1)::int AS below_min_7d,
                   (SELECT round(min(soc)) FROM night n WHERE n.status_id = s.id AND einsp > 200)::int AS night_min_soc_feeding,
                   (SELECT round(count(*) FILTER (WHERE einsp > 200) * 5.0 / 60, 1) FROM night n WHERE n.status_id = s.id)::float AS night_feed_hours,
                   (SELECT round((COALESCE(sum(einsp) FILTER (WHERE einsp > 200 AND soc IS NOT NULL AND min_soc IS NOT NULL AND soc < min_soc - 1), 0) * 5.0 / 60 / 1000)::numeric, 2)
                      FROM night n WHERE n.status_id = s.id)::float AS night_below_min_kwh,
                   (SELECT round((sum(einsp) FILTER (WHERE einsp > 0) * 5.0 / 60 / 1000)::numeric, 1) FROM night n WHERE n.status_id = s.id)::float AS night_feed_kwh,
                   (SELECT round(avg(soc)) FROM night n, today
                     WHERE n.status_id = s.id AND n.lt BETWEEN today.d - interval '5 hours 15 minutes' AND today.d - interval '4 hours 45 minutes')::int AS soc_evening,
                   (SELECT round(avg(soc)) FROM night n, today
                     WHERE n.status_id = s.id AND n.lt BETWEEN today.d + interval '5 hours 45 minutes' AND today.d + interval '6 hours 15 minutes')::int AS soc_morning,
                   f.kwh_7d::float AS feed_7d_kwh
              FROM members_openhabstatus s
              LEFT JOIN feed f ON f.status_id = s.id
             WHERE COALESCE(s.setup_phase, '') <> 'geloescht'`
        );
        return result.rows;
    } finally {
        db.release();
    }
};
