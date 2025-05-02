import { authDbConnection } from "$lib/server/db/db";


export const getUsers = async () => {


    const sql = await authDbConnection();
    const result = await sql.query(`SELECT * FROM users`);
    await sql.end();
    sql.release();

    return result?.row;
};
