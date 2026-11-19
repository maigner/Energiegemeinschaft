import { middlewareDbConnection } from "$lib/server/db/db";

// Datenbasis der Seite /board/security: die fail2ban-Sperren von s1 samt
// ungefaehrem Standort (Tabelle security_fail2banban, Migration security
// 0001). Geschrieben wird sie vom root-Timer fail2ban-geo auf s1
// (scripts/fail2ban-geo/), der auch die Adressen nach 90 Tagen loescht -
// die Website liest nur.

/** Zeitraeume der Seite in Tagen; 0 = alles. */
export const PERIODS = [1, 7, 30, 90, 0];

// Adressen aus privaten Netzen haben keinen Standort. Stehen sie in der
// Liste, hat fail2ban etwas Eigenes gesperrt (2026-10-08: den
// Website-Container 172.17.0.2), deshalb werden sie eigens markiert.
const INTERNAL = `(ip << inet '10.0.0.0/8' OR ip << inet '172.16.0.0/12'
                OR ip << inet '192.168.0.0/16' OR ip << inet '127.0.0.0/8'
                OR ip << inet '169.254.0.0/16' OR ip << inet 'fc00::/7'
                OR ip << inet 'fe80::/10' OR ip = inet '::1')`;

const WHERE = `($1::int = 0 OR banned_at >= now() - make_interval(days => $1::int))
           AND ($2::text = '' OR jail = $2::text)`;

/**
 * Alles, was die Seite fuer einen Zeitraum und ein Jail zeigt. Zeitpunkte
 * kommen als Text in Europe/Vienna zurueck, damit node-pg sie nicht in die
 * Zeitzone des Prozesses umrechnet.
 *
 * @param {number} days  Zeitraum in Tagen, 0 = alles
 * @param {string} jail  Jail-Name oder '' fuer alle
 */
export const getFail2banOverview = async (days, jail) => {
    const db = await middlewareDbConnection();
    try {
        const exists = await db.query(
        `SELECT to_regclass('public.security_fail2banban') IS NOT NULL AS ok`
        );
        if (!exists.rows[0]?.ok) return { available: false };

        const params = [days, jail];
        // Unter einer Woche stundenweise, sonst tageweise
        const bucket = days === 1 ? "hour" : "day";
        const jails = await db.query(
            `SELECT jail, count(*)::int AS count,
                    to_char(max(banned_at) AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD HH24:MI') AS last
               FROM security_fail2banban GROUP BY jail ORDER BY jail`
        );
        const totals = await db.query(
            `SELECT count(*)::int AS bans,
                    count(DISTINCT country_code) FILTER (WHERE country_code <> '')::int AS countries,
                    count(DISTINCT asn)::int AS networks,
                    count(*) FILTER (WHERE latitude IS NULL)::int AS unlocated,
                    count(*) FILTER (WHERE ${INTERNAL})::int AS internal,
                    to_char(min(banned_at) AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD') AS first_day,
                    to_char(max(created_at) AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD HH24:MI') AS last_import
               FROM security_fail2banban WHERE ${WHERE}`,
            params
        );
        const points = await db.query(
            `SELECT latitude, longitude, max(city) AS city, max(country) AS country,
                    count(*)::int AS count
               FROM security_fail2banban
              WHERE ${WHERE} AND latitude IS NOT NULL AND longitude IS NOT NULL
              GROUP BY latitude, longitude
              ORDER BY count(*) DESC`,
            params
        );
        const countries = await db.query(
            `SELECT country_code, max(country) AS country, count(*)::int AS count
               FROM security_fail2banban
              WHERE ${WHERE} AND country_code <> ''
              GROUP BY country_code
              ORDER BY count(*) DESC, country_code
              LIMIT 15`,
            params
        );
        const networks = await db.query(
            `SELECT asn::text AS asn, max(as_org) AS as_org, count(*)::int AS count,
                    string_agg(DISTINCT country_code, ', ' ORDER BY country_code)
                        FILTER (WHERE country_code <> '') AS countries
               FROM security_fail2banban
              WHERE ${WHERE} AND asn IS NOT NULL
              GROUP BY asn
              ORDER BY count(*) DESC, asn
              LIMIT 15`,
            params
        );
        // Alle Zeitabschnitte des Zeitraums, auch die ohne Sperre - sonst
        // hat das Balkendiagramm Luecken, die wie fehlende Daten aussehen.
        const buckets = await db.query(
            `SELECT to_char(t, 'YYYY-MM-DD"T"HH24:MI') AS bucket
               FROM generate_series(
                        date_trunc('${bucket}', (CASE WHEN $1::int = 0
                            THEN (SELECT min(banned_at) FROM security_fail2banban WHERE ${WHERE})
                            ELSE now() - make_interval(days => $1::int) END) AT TIME ZONE 'Europe/Vienna'),
                        date_trunc('${bucket}', now() AT TIME ZONE 'Europe/Vienna'),
                        interval '1 ${bucket}') AS t`,
            params
        );
        const series = await db.query(
            `SELECT to_char(date_trunc('${bucket}', banned_at AT TIME ZONE 'Europe/Vienna'),
                            'YYYY-MM-DD"T"HH24:MI') AS bucket,
                    jail, count(*)::int AS count
               FROM security_fail2banban
              WHERE ${WHERE}
              GROUP BY 1, 2
              ORDER BY 1, 2`,
            params
        );
        const recent = await db.query(
            `SELECT to_char(banned_at AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD HH24:MI') AS banned_at,
                    jail, host(ip) AS ip, bantime_seconds, ban_count,
                    country_code, country, city, asn::text AS asn, as_org,
                    COALESCE(${INTERNAL}, false) AS internal
               FROM security_fail2banban
              WHERE ${WHERE}
              ORDER BY security_fail2banban.banned_at DESC, id DESC
              LIMIT 50`,
            params
        );
        return {
            available: true,
            bucket,
            jails: jails.rows,
            totals: totals.rows[0],
            points: points.rows,
            countries: countries.rows,
            networks: networks.rows,
            buckets: buckets.rows.map((r) => r.bucket),
            series: series.rows,
            recent: recent.rows,
        };
    } finally {
        db.release();
    }
};
