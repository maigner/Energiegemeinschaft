import { connectToMiddlewareDB } from "$lib/server/db/db";


export const getMembers = async () => {
    const sql = await connectToMiddlewareDB();
    const result = await sql.query(`SELECT * FROM members_member`);
    await sql.end();
    sql.release();
    return result?.rows;
};

export const isMember = async (email: String) => {
    
    const sql = await connectToMiddlewareDB();
    const result = await sql.query(`SELECT * FROM members_member`);
    await sql.end();
    sql.release();
    return result?.rows;
};
