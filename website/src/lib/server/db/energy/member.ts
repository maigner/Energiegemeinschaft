import { middlewareDbConnection } from "$lib/server/db/db";


export const getMeasurementPoints = async (memberId: number) => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select 
            mp.id as mp_id, mp.identifier as mp_identifier, 
            * from members_measurementpoint mp, members_member m
        where mp.member_id = m.id
        and m.id = $1
        ;
        `, [memberId]);
    sql.release();
    const rows = result?.rows;
    return rows;

};


export const getEnergyData = async (date: Date, memberId: number) => {

    //TODO: fix time zone
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select metering_measurement.*, mm.* from metering_measurement
        inner join public.members_measurementpoint mm on mm.id = metering_measurement.measurement_point_id
        inner join public.members_member m on m.id = mm.member_id
        where m.id = $2
        AND metering_measurement.timestamp::date = $1
        order by metering_measurement.timestamp
        ;
        `, [date, memberId]);
    sql.release();
    const rows = result?.rows;
    /*
    rows.forEach( (obj) => {
        obj.timestamp = new Date(obj.timestamp);
    })
    */
   console.log(rows[0]);

    return rows;

};