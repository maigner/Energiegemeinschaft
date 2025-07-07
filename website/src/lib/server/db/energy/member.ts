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

