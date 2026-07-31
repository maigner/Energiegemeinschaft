import { middlewareDbConnection } from "$lib/server/db/db";

// Maximale Groesse des data-JSON in Bytes; schuetzt die Tabelle vor
// versehentlich (oder boeswillig) aufgeblasenen Payloads.
export const MAX_STATUS_DATA_BYTES = 16 * 1024;

/**
 * Erzeugt ein neues Status-Token fuer ein Mitglied. Das Token wird bei der
 * Einrichtung auf dem Pi hinterlegt (ibm.conf) und authentifiziert dessen
 * Status-Pushes.
 *
 * @param {number} memberId - members_member.id
 * @returns {Promise<string>} das erzeugte Token
 */
export const createOpenhabToken = async (memberId) => {
    const token = crypto.randomUUID().replaceAll('-', '');
    const db = await middlewareDbConnection();
    try {
        await db.query(
            `INSERT INTO members_openhabstatus (member_id, token, name, created_at, last_seen, data)
             VALUES ($1, $2, '', now(), NULL, '{}')`,
            [memberId, token]
        );
        return token;
    } finally {
        db.release();
    }
};

/**
 * Loescht ein Token (widerruft es); die Anlage kann danach nicht mehr pushen.
 *
 * @param {number} id - members_openhabstatus.id
 */
export const deleteOpenhabToken = async (id) => {
    const db = await middlewareDbConnection();
    try {
        await db.query(`DELETE FROM members_openhabstatus WHERE id = $1`, [id]);
    } finally {
        db.release();
    }
};

/**
 * Speichert einen Status-Push einer Anlage. Nur vom Vorstand erzeugte
 * Tokens werden akzeptiert.
 *
 * @param {string} token
 * @param {string} name - Anlagenname aus ibm.conf, aktualisiert die Anzeige
 * @param {object} data
 * @returns {Promise<boolean>} true wenn gespeichert, false bei unbekanntem Token
 */
export const pushOpenhabStatus = async (token, name, data) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `UPDATE members_openhabstatus
                SET last_seen = now(),
                    name = COALESCE(NULLIF($2, ''), name),
                    data = $3
              WHERE token = $1
             RETURNING id`,
            [token, name, JSON.stringify(data)]
        );
        return result.rowCount > 0;
    } finally {
        db.release();
    }
};

/**
 * Alle Tokens/Anlagen mit letztem Status, fuer das Vorstands-Dashboard.
 */
export const getOpenhabStatuses = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT s.id,
                    s.token,
                    s.name,
                    s.created_at,
                    s.last_seen,
                    EXTRACT(EPOCH FROM (now() - s.last_seen)) AS age_seconds,
                    s.data,
                    m.name AS member_name,
                    m.identifier AS member_identifier
               FROM members_openhabstatus s
               JOIN members_member m ON s.member_id = m.id
              ORDER BY m.name, s.created_at`
        );
        return result.rows;
    } finally {
        db.release();
    }
};
