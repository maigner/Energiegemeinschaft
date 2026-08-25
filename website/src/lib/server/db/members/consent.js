import { middlewareDbConnection } from "$lib/server/db/db";

// Einwilligungen der Mitglieder (members_consent, Django-Model
// members.Consent): Nachweis nach Art. 7 Abs. 1 DSGVO. Je Erteilung eine
// Zeile mit der Version des vorgelegten Texts; ein Widerruf setzt
// revoked_at. Zeilen werden nie geloescht (Nachweis). Der aktuelle Text
// samt Version: $lib/consent/speichermanagement.js und
// routes/(website)/user/[memberId]/speichermanagement/ConsentText.svelte.

/**
 * Juengste Einwilligungszeile eines Mitglieds fuer einen Zweck, oder null.
 * Auswertung beim Aufrufer: revoked_at gesetzt = widerrufen; text_version
 * ungleich der aktuellen = erneut zustimmen lassen.
 *
 * @param {number} memberIdentifier
 * @param {string} scope
 * @returns {Promise<{ text_version: string, granted_at: Date, revoked_at: Date | null } | null>}
 */
export const getConsent = async (memberIdentifier, scope) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT c.text_version, c.granted_at, c.revoked_at
               FROM members_consent c
               JOIN members_member m ON c.member_id = m.id
              WHERE m.identifier = $1 AND c.scope = $2
              ORDER BY c.granted_at DESC
              LIMIT 1`,
            [memberIdentifier, scope]
        );
        return result.rows[0] ?? null;
    } finally {
        db.release();
    }
};

/**
 * Einwilligung erteilen: legt eine neue Zeile an (idempotent: existiert
 * schon eine nicht widerrufene Zeile derselben Textversion, passiert
 * nichts).
 *
 * @param {number} memberIdentifier
 * @param {string} scope
 * @param {string} textVersion
 * @param {string} email E-Mail der angemeldeten Sitzung (Nachweis)
 */
export const grantConsent = async (memberIdentifier, scope, textVersion, email) => {
    const db = await middlewareDbConnection();
    try {
        await db.query(
            `INSERT INTO members_consent
                    (member_id, scope, text_version, granted_at, granted_email, revoked_at)
             SELECT m.id, $2, $3, now(), $4, NULL
               FROM members_member m
              WHERE m.identifier = $1
                AND NOT EXISTS (
                    SELECT 1 FROM members_consent c
                     WHERE c.member_id = m.id AND c.scope = $2
                       AND c.text_version = $3 AND c.revoked_at IS NULL)`,
            [memberIdentifier, scope, textVersion, email]
        );
    } finally {
        db.release();
    }
};

/**
 * Einwilligung widerrufen: stempelt alle nicht widerrufenen Zeilen des
 * Mitglieds fuer diesen Zweck.
 *
 * @param {number} memberIdentifier
 * @param {string} scope
 * @returns {Promise<boolean>} true, wenn eine aktive Einwilligung bestand
 */
export const revokeConsent = async (memberIdentifier, scope) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `UPDATE members_consent c
                SET revoked_at = now()
               FROM members_member m
              WHERE c.member_id = m.id AND m.identifier = $1
                AND c.scope = $2 AND c.revoked_at IS NULL`,
            [memberIdentifier, scope]
        );
        return (result.rowCount ?? 0) > 0;
    } finally {
        db.release();
    }
};

/**
 * Einwilligungsstand aller Mitglieder fuer einen Zweck (Vorstands-
 * Dashboard): je Mitglied die juengste aktive Erteilung (granted_at,
 * text_version) bzw. der letzte Widerruf. Mitglieder ohne Zeile fehlen in
 * der Map.
 *
 * @param {string} scope
 * @returns {Promise<Map<number, { granted_at: Date | null, text_version: string | null, revoked_at: Date | null }>>}
 */
export const listConsentStates = async (scope) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT m.identifier,
                    MAX(c.granted_at) FILTER (WHERE c.revoked_at IS NULL) AS granted_at,
                    (ARRAY_AGG(c.text_version ORDER BY c.granted_at DESC)
                        FILTER (WHERE c.revoked_at IS NULL))[1] AS text_version,
                    MAX(c.revoked_at) AS revoked_at
               FROM members_consent c
               JOIN members_member m ON c.member_id = m.id
              WHERE c.scope = $1
              GROUP BY m.identifier`,
            [scope]
        );
        return new Map(result.rows.map((/** @type {any} */ r) => [
            Number(r.identifier),
            { granted_at: r.granted_at, text_version: r.text_version, revoked_at: r.revoked_at }
        ]));
    } finally {
        db.release();
    }
};
