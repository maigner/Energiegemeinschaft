import { connectToDB } from "$lib/server/db/db";


export const getUsers = async () => {


    const sql = await connectToDB();
    const result = await sql.query(`SELECT * FROM users`);
    await sql.end();
    sql.release();

    return result?.row;
};
