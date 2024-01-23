import { connectToMiddlewareDB } from "$lib/db";



export const getMembers = async () => {


    const sql = await connectToMiddlewareDB();
    const result = await sql.query(`SELECT * FROM members_member`);
    await sql.end();
    sql.release();
    return result?.rows;
};
