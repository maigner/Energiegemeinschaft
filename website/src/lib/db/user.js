import { connectToDB } from "$lib/db";



export const getUser = async () => {


    const sql = await connectToDB();
    const result = await sql.query(`SELECT * FROM users`);
    await sql.end();
    sql.release();

    return result;
};
