import { middlewareDbConnection } from "$lib/server/db/db";


export const getOpenhabDbConfigForMember = async (memberId) => {
    const db = await middlewareDbConnection();
    //console.log({ db });

    const result = await db.query(
        `SELECT o.host, o.port, o.database, o.user, o.password
         FROM members_openhabdb o
         JOIN members_member m ON o.member_id = m.id
         WHERE m.identifier = $1`,
        [memberId]
    );


    return result.rows[0] ?? null;
};