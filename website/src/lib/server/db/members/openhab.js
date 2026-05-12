import { middlewareDbConnection, openhabDbConnection } from "$lib/server/db/db";

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
    db.release();

    return result.rows[0] ?? null;
};


export const getItems = async (memberId) => {
    const db = await openhabDbConnection(memberId);

    const result = await db.query(
        `SELECT itemid, itemname
         FROM items`
    );
    db.release();

    return result.rows ?? null;
};


export const getItemStateHistory = async (memberId, itemId, from, to) => {
    const db = await openhabDbConnection(memberId);

    // convert itemId to tablename format "item0003"
    const format = (n) => `item${String(n).padStart(4, '0')}`;
    const tablename = format(itemId); // "item0003"

    const result = await db.query(`
        SELECT time, value
        FROM $1
        where time >= $2 AND time <= $3
        ORDER BY time ASC`,
        [tablename, from, to]
    );
    db.release();

    return result.rows ?? null;
};