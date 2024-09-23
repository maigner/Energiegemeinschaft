import { middlewareDbConnection } from "$lib/server/db/db";
import { CASHIER1, CASHIER2, CHAIR1, CHAIR2 } from "$env/static/private";


export const getBoardMemberByEmail = async (email: string) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member
    where email like $1 and board_member = true`, [email]);
    await sql.end();
    sql.release();
    return (result?.rows.length > 0 ? result?.rows[0] : null);
};


export const cashierSession = async (session: any) => {
    //console.log({session});
    if (session?.user?.email === CHAIR1) {
        return true;
    }
    if (session?.user?.email === CHAIR2) {
        return true;
    }
    if (session?.user?.email === CASHIER1) {
        return true;
    }
    if (session?.user?.email === CASHIER2) {
        return true;
    }
    return false;
}