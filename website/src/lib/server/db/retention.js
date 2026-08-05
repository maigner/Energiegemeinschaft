import { authDbConnection, middlewareDbConnection } from "$lib/server/db/db";

/**
 * Loescht abgelaufene Auth.js-Daten (taeglicher Cron-Job):
 * Magic-Link-Tokens und Sitzungen, deren Ablaufdatum ueberschritten ist.
 * Ohne diesen Job sammeln sich die Zeilen unbegrenzt an (Speicherbegrenzung,
 * Art. 5 Abs. 1 lit. e DSGVO).
 */
export const pruneExpiredAuthData = async () => {
    const client = await authDbConnection();
    try {
        const tokens = await client.query(
            `DELETE FROM verification_token WHERE expires < NOW()`
        );
        const sessions = await client.query(
            `DELETE FROM sessions WHERE expires < NOW()`
        );
        if (tokens.rowCount > 0 || sessions.rowCount > 0) {
            console.log(
                `auth retention: removed ${tokens.rowCount} expired tokens, ${sessions.rowCount} expired sessions`
            );
        }
    } finally {
        client.release();
    }
};

/**
 * Loescht Eintraege im Zugriffsprotokoll (members_memberdataaccesslog),
 * die aelter als ein Jahr sind.
 */
export const pruneMemberDataAccessLog = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `DELETE FROM members_memberdataaccesslog
              WHERE created_at < NOW() - INTERVAL '1 year'`
        );
        if (result.rowCount > 0) {
            console.log(`access log pruned: ${result.rowCount} rows`);
        }
    } finally {
        db.release();
    }
};
