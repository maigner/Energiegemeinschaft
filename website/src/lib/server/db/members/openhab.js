import { middlewareDbConnection, openhabDbConnection } from "$lib/server/db/db";

export const getOpenhabDbConfigForMember = async (memberIdentifier) => {
    const db = await middlewareDbConnection();
    //console.log({ db });

    const result = await db.query(
        `SELECT o.host, o.port, o.database, o.user, o.password
         FROM members_openhabdb o
         JOIN members_member m ON o.member_id = m.id
         WHERE m.identifier = $1`,
        [memberIdentifier]
    );
    db.release();

    return result.rows[0] ?? null;
};


export const getItems = async (memberIdentifier) => {
    const db = await openhabDbConnection(memberIdentifier);

    const result = await db.query(
        `SELECT itemid, itemname
         FROM items`
    );
    db.release();

    return result.rows ?? null;
};


export const getItemStateHistory = async (memberIdentifier, itemId, from, to) => {
    const db = await openhabDbConnection(memberIdentifier);

    console.log({ memberIdentifier, itemId, from, to });

    // convert itemId to tablename format "item0003"
    const format = (n) => `item${String(n).padStart(4, '0')}`;
    const tablename = format(itemId); // "item0003"

    console.log({ tablename });

    const result = await db.query(`
        SELECT time, value
        FROM ${tablename}        
        where time >= $1 AND time <= $2
        ORDER BY time ASC`,
        [from, to]
    );
    db.release();

    return result.rows ?? null;
};