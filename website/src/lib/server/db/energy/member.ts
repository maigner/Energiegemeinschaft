import { middlewareDbConnection } from "$lib/server/db/db";


export const getEnergyData = async (date: Date, memberId: number) => {

    //TODO: fix time zone
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select 
        date_trunc('hour', m.timestamp) AS timestamp,
        SUM(m.value) AS sum_over_hour,
        m.meter_code_id, mc.description
        from public.metering_measurement m
        inner join public.members_measurementpoint mp on mp.id = m.measurement_point_id
        inner join public.members_member mm on mm.id = mp.member_id
        inner join public.metering_metercode mc on m.meter_code_id = mc.id
        where mm.id = $2
        AND m.timestamp::date = $1
        group by m.meter_code_id, mc.description, date_trunc('hour', m.timestamp)
        ;
        `, [date, memberId]);
    sql.release();
    const rows = result?.rows;
    return rows;
};