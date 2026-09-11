import { middlewareDbConnection } from "$lib/server/db/db";

// Energiebilanz je Trafostation fuer die Abwaegung "lokale EEG" auf
// /board/map. Liest die Materialized View station_metering_15min
// (middleware/README.md); ohne die View liefert alles null und die Seite
// zeigt einen Hinweis statt der Tabelle.

export type StationMonthRow = {
    station_id: number;
    month: string; // YYYY-MM (Europe/Vienna)
    consumption_kwh: number;
    regional_coverage_kwh: number; // Eigendeckung als Teil der regionalen EEG (Code 195)
    generation_kwh: number;
    regional_surplus_kwh: number; // Gemeinschaftsueberschuss (Code 197)
    local_coverage_kwh: number; // je Viertelstunde min(Verbrauch, Erzeugung) der Station
};

export type StationEnergyBalance = {
    from: string; // ISO-Datum des ersten Tages im Fenster
    to: string; // ISO-Datum des letzten Tages mit Daten
    months: StationMonthRow[];
};

const MISSING_TABLE = "42P01";

const num = (v: unknown) => (v == null ? 0 : Number(v));

/**
 * Monatssummen je Station fuer die letzten `days` Tage vor dem letzten
 * Datentag. Die lokale Deckung muss auf Viertelstundenebene gebildet werden,
 * deshalb summiert erst die Abfrage und nicht der Client.
 */
export const getStationEnergyBalance = async (
    days = 365,
): Promise<StationEnergyBalance | null> => {
    const sql = await middlewareDbConnection();
    try {
        const bounds = await sql.query(`
            SELECT (max(timestamp) AT TIME ZONE 'Europe/Vienna')::date AS last_day
            FROM station_metering_15min
        `);
        const lastDay: Date | null = bounds.rows[0]?.last_day ?? null;
        if (!lastDay) return { from: "", to: "", months: [] };

        const result = await sql.query(
            `
            WITH window_bounds AS (
                SELECT ($1::date - make_interval(days => $2::int) + interval '1 day')
                           AT TIME ZONE 'Europe/Vienna' AS from_ts,
                       ($1::date + interval '1 day') AT TIME ZONE 'Europe/Vienna' AS to_ts
            )
            SELECT s.station_id,
                   to_char(date_trunc('month', s.timestamp AT TIME ZONE 'Europe/Vienna'), 'YYYY-MM') AS month,
                   SUM(s.consumption_kwh) AS consumption_kwh,
                   SUM(s.self_coverage_kwh) AS regional_coverage_kwh,
                   SUM(s.generation_kwh) AS generation_kwh,
                   SUM(s.surplus_kwh) AS regional_surplus_kwh,
                   SUM(LEAST(COALESCE(s.consumption_kwh, 0), COALESCE(s.generation_kwh, 0))) AS local_coverage_kwh
            FROM station_metering_15min s, window_bounds w
            WHERE s.timestamp >= w.from_ts AND s.timestamp < w.to_ts
            GROUP BY 1, 2
            ORDER BY 1, 2
            `,
            [lastDay, days],
        );
        const months: StationMonthRow[] = result.rows.map((r: any) => ({
            station_id: Number(r.station_id),
            month: r.month,
            consumption_kwh: num(r.consumption_kwh),
            regional_coverage_kwh: num(r.regional_coverage_kwh),
            generation_kwh: num(r.generation_kwh),
            regional_surplus_kwh: num(r.regional_surplus_kwh),
            local_coverage_kwh: num(r.local_coverage_kwh),
        }));
        const from = new Date(lastDay);
        from.setDate(from.getDate() - days + 1);
        return {
            from: from.toISOString().slice(0, 10),
            to: new Date(lastDay).toISOString().slice(0, 10),
            months,
        };
    } catch (e: any) {
        if (e?.code === MISSING_TABLE) return null;
        throw e;
    } finally {
        sql.release();
    }
};

export type StationPointCounts = {
    station_id: number;
    consumption_points: number;
    generation_points: number;
};

/** Aktive Zaehlpunkte je Station, getrennt nach Verbrauch und Erzeugung. */
export const getStationPointCounts = async (): Promise<StationPointCounts[]> => {
    const sql = await middlewareDbConnection();
    try {
        const result = await sql.query(`
            SELECT m.transformer_station_id AS station_id,
                   count(*) FILTER (WHERE mp.type = 'CONSUMPTION') AS consumption_points,
                   count(*) FILTER (WHERE mp.type = 'GENERATION') AS generation_points
            FROM members_measurementpoint mp
            JOIN members_member m ON m.id = mp.member_id
            WHERE m.transformer_station_id IS NOT NULL
              AND mp.status = 'ACTIVE'
            GROUP BY 1
        `);
        return result.rows.map((r: any) => ({
            station_id: Number(r.station_id),
            consumption_points: Number(r.consumption_points),
            generation_points: Number(r.generation_points),
        }));
    } finally {
        sql.release();
    }
};
