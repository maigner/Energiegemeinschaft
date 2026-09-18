import { middlewareDbConnection } from "$lib/server/db/db";

// Datenbasis des Speicherrechners (/user/[memberId]/speicherrechner):
// die 15-Minuten-Werte eines Mitglieds am Netzanschluss ueber die letzten
// zwoelf vollstaendigen Kalendermonate (ganze Monate, weil der
// Leistungspreis der Netzentgelte je Monat abrechnet) und dazu der
// ungedeckte Bedarf der Gemeinschaft je Viertelstunde - so viel kann sie
// aus einer Batterie zusaetzlich abnehmen. Gerechnet wird im Browser
// ($lib/batteryCalculator.js).

const MISSING_TABLE = "42P01";

// Rueckfall ohne station_metering_15min: abends und nachts nimmt die
// Gemeinschaft praktisch jede Batterieeinspeisung ab (Defizit 80-120 kW),
// tagsueber wird nicht entladen
const FALLBACK_NIGHT_WH = 1_000_000;
const isNightHour = (/** @type {number} */ hour) => hour >= 18 || hour < 8;

const toWh = (/** @type {any} */ kwh) => Math.round(Number(kwh ?? 0) * 1000);

/**
 * @param {number} memberIdentifier
 * @returns {Promise<null | {
 *   from: string, to: string, days: number,
 *   hasConsumption: boolean, hasGeneration: boolean,
 *   imp: number[], impEeg: number[], exp: number[], expRest: number[], uncovered: number[],
 *   months: { label: string, from: number }[],
 *   communityFromView: boolean
 * }>}  Energien in Wh je Viertelstunde; null ohne Messwerte
 */
export const getBatteryCalculatorSeries = async (memberIdentifier) => {
    const db = await middlewareDbConnection();
    try {
        // Unvollstaendig gelieferte Tage (Zeilen da, Werte 0 - siehe
        // daily_metering_quality) wuerden wie Tage ohne Verbrauch und ohne
        // Sonne aussehen und bleiben draussen.
        const member = await db.query(`
            WITH points AS (
                SELECT p.id
                FROM members_measurementpoint p
                JOIN members_member mm ON mm.id = p.member_id
                WHERE mm.identifier = $1 AND p.status = 'ACTIVE'
            ), bounds AS (
                SELECT date_trunc('month', (max(m.timestamp) + interval '15 minutes')
                           AT TIME ZONE 'Europe/Vienna') AS end_local
                FROM metering_measurement m
                WHERE m.measurement_point_id IN (SELECT id FROM points)
            ), quality AS (
                SELECT day, bool_or(is_complete) AS is_complete
                FROM daily_metering_quality
                GROUP BY day
            )
            SELECT extract(epoch FROM m.timestamp)::bigint AS ts,
                   to_char(m.timestamp AT TIME ZONE 'Europe/Vienna', 'YYYY-MM') AS month,
                   extract(hour FROM m.timestamp AT TIME ZONE 'Europe/Vienna')::int AS hour,
                   sum(m.value) FILTER (WHERE m.meter_code_id = 193) AS imp,
                   sum(m.value) FILTER (WHERE m.meter_code_id = 195) AS imp_eeg,
                   sum(m.value) FILTER (WHERE m.meter_code_id = 196) AS exp,
                   sum(m.value) FILTER (WHERE m.meter_code_id = 197) AS exp_rest,
                   count(*) FILTER (WHERE m.meter_code_id = 193) AS n_imp,
                   count(*) FILTER (WHERE m.meter_code_id = 196) AS n_exp
            FROM metering_measurement m
            CROSS JOIN bounds b
            LEFT JOIN quality q ON q.day = (m.timestamp AT TIME ZONE 'Europe/Vienna')::date
            WHERE m.measurement_point_id IN (SELECT id FROM points)
              AND m.meter_code_id IN (193, 195, 196, 197)
              AND m.timestamp >= (b.end_local - interval '12 months') AT TIME ZONE 'Europe/Vienna'
              AND m.timestamp <  b.end_local AT TIME ZONE 'Europe/Vienna'
              AND coalesce(q.is_complete, true)
            GROUP BY m.timestamp
            ORDER BY m.timestamp
        `, [memberIdentifier]);

        const rows = member.rows;
        if (rows.length === 0) return null;

        const firstTs = Number(rows[0].ts);
        const lastTs = Number(rows[rows.length - 1].ts);

        /** @type {Map<number, number> | null} */
        let community = null;
        try {
            const result = await db.query(`
                SELECT extract(epoch FROM timestamp)::bigint AS ts,
                       greatest(0, sum(coalesce(consumption_kwh, 0)) - sum(coalesce(self_coverage_kwh, 0))) AS uncovered
                FROM station_metering_15min
                WHERE timestamp BETWEEN to_timestamp($1) AND to_timestamp($2)
                GROUP BY timestamp
            `, [firstTs, lastTs]);
            community = new Map(result.rows.map((r) => [Number(r.ts), toWh(r.uncovered)]));
        } catch (/** @type {any} */ e) {
            if (e?.code !== MISSING_TABLE) throw e;
        }

        const n = rows.length;
        const imp = new Array(n), impEeg = new Array(n), exp = new Array(n),
            expRest = new Array(n), uncovered = new Array(n);
        /** @type {{ label: string, from: number }[]} */
        const months = [];
        let hasConsumption = false, hasGeneration = false;

        rows.forEach((row, i) => {
            imp[i] = toWh(row.imp);
            impEeg[i] = toWh(row.imp_eeg);
            exp[i] = toWh(row.exp);
            expRest[i] = toWh(row.exp_rest);
            uncovered[i] = community?.get(Number(row.ts))
                ?? (isNightHour(row.hour) ? FALLBACK_NIGHT_WH : 0);
            if (Number(row.n_imp) > 0) hasConsumption = true;
            if (Number(row.n_exp) > 0) hasGeneration = true;
            if (months.length === 0 || months[months.length - 1].label !== row.month) {
                months.push({ label: row.month, from: i });
            }
        });

        return {
            from: new Date(firstTs * 1000).toISOString(),
            to: new Date(lastTs * 1000).toISOString(),
            days: n / 96,
            hasConsumption, hasGeneration,
            imp, impEeg, exp, expRest, uncovered,
            months,
            communityFromView: community !== null,
        };
    } finally {
        db.release();
    }
};


/**
 * Identifier der Mitglieder (aus der uebergebenen Liste) mit aktivem
 * Einspeisezaehlpunkt - nur fuer sie gibt es den Speicherrechner.
 * @param {number[]} memberIdentifiers
 * @returns {Promise<number[]>}
 */
export const getMembersWithGeneration = async (memberIdentifiers) => {
    if (memberIdentifiers.length === 0) return [];
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(`
            SELECT DISTINCT mm.identifier
            FROM members_member mm
            JOIN members_measurementpoint p ON p.member_id = mm.id
            WHERE mm.identifier = ANY($1::int[])
              AND p.type = 'GENERATION' AND p.status = 'ACTIVE'
            ORDER BY mm.identifier
        `, [memberIdentifiers]);
        return result.rows.map((r) => Number(r.identifier));
    } finally {
        db.release();
    }
};
