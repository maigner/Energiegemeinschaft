// Podlist-Importe in der Middleware-DB (members_podlistimport, members_podlistentry;
// Django-Modelle PodlistImport/PodlistEntry, Migration members 0041). Jeder
// Import behaelt seine Zeilen; die Pruefungen lesen immer den juengsten
// fehlerfreien Import. Alle Funktionen nehmen die DB als erstes Argument
// (Pool oder Client mit .query), damit scripts/podlist-fetch.js sie ohne
// SvelteKit nutzen kann.

/**
 * @typedef {import('./sheet.js').PodlistEntry} PodlistEntry
 * @typedef {{ query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> }} Queryable
 */

/**
 * Wurde diese Mail (Message-ID) schon verarbeitet, egal ob mit Erfolg oder
 * Fehler? Fehlerhafte Anhaenge werden so nicht bei jedem Lauf neu gemeldet.
 * @param {Queryable} db
 * @param {string} messageId
 */
export const hasPodlistMessage = async (db, messageId) => {
    const result = await db.query(
        `SELECT 1 FROM members_podlistimport WHERE message_id = $1 LIMIT 1`,
        [messageId]
    );
    return result.rows.length > 0;
};

/**
 * Import samt Zeilen in einer Transaktion speichern.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {{
 *   source: 'mail' | 'file',
 *   fileName: string,
 *   messageId?: string | null,
 *   requestedAt?: string | null,   // `JJJJ-MM-TT HH:MM` lokale Zeit
 *   nextcloudPath?: string | null,
 *   entries: PodlistEntry[],
 * }} data
 * @returns {Promise<{ id: number, rowCount: number, unknownCount: number }>}
 */
export const storePodlistImport = async (db, data) => {
    // Ein PoolClient hat release(), ein Pool nicht (beide haben connect())
    const ownClient = typeof (/** @type {any} */ (db)).release !== 'function';
    const client = ownClient ? await (/** @type {import('pg').Pool} */ (db)).connect() : /** @type {import('pg').PoolClient} */ (db);
    const release = ownClient ? () => client.release() : () => {};
    try {
        await client.query('BEGIN');
        const inserted = await client.query(
            `INSERT INTO members_podlistimport
                (received_at, requested_at, source, file_name, message_id, row_count, unknown_count, status, error, nextcloud_path)
             VALUES (now(), ($1::timestamp AT TIME ZONE 'Europe/Vienna'), $2, $3, $4, $5, 0, 'ok', '', $6)
             RETURNING id`,
            [data.requestedAt ?? null, data.source, data.fileName, data.messageId ?? null, data.entries.length, data.nextcloudPath ?? '']
        );
        const id = inserted.rows[0].id;
        if (data.entries.length) {
            await client.query(
                `INSERT INTO members_podlistentry
                    (podlist_import_id, row_no, identifier, direction, participation_factor, activated, active_since, active_until)
                 SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::smallint[], $6::date[], $7::date[], $8::date[])`,
                [
                    id,
                    data.entries.map((e) => e.rowNo),
                    data.entries.map((e) => e.identifier),
                    data.entries.map((e) => e.direction),
                    data.entries.map((e) => e.participationFactor),
                    data.entries.map((e) => e.activated),
                    data.entries.map((e) => e.activeSince),
                    data.entries.map((e) => e.activeUntil),
                ]
            );
        }
        const unknown = await client.query(
            `UPDATE members_podlistimport i
                SET unknown_count = (
                    SELECT count(DISTINCT e.identifier)
                    FROM members_podlistentry e
                    WHERE e.podlist_import_id = i.id
                      AND NOT EXISTS (SELECT 1 FROM members_measurementpoint mp WHERE mp.identifier = e.identifier)
                )
              WHERE i.id = $1
              RETURNING unknown_count`,
            [id]
        );
        await client.query('COMMIT');
        return { id, rowCount: data.entries.length, unknownCount: Number(unknown.rows[0].unknown_count) };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        release();
    }
};

/**
 * Fehlgeschlagene Verarbeitung festhalten (ohne Zeilen), damit die Mail
 * nicht erneut angefasst wird.
 * @param {Queryable} db
 * @param {{ source: 'mail' | 'file', fileName: string, messageId?: string | null, requestedAt?: string | null, error: string }} data
 */
export const storePodlistFailure = async (db, data) => {
    await db.query(
        `INSERT INTO members_podlistimport
            (received_at, requested_at, source, file_name, message_id, row_count, unknown_count, status, error, nextcloud_path)
         VALUES (now(), ($1::timestamp AT TIME ZONE 'Europe/Vienna'), $2, $3, $4, 0, 0, 'error', $5, '')
         ON CONFLICT (message_id) DO NOTHING`,
        [data.requestedAt ?? null, data.source, data.fileName, data.messageId ?? null, data.error.slice(0, 2000)]
    );
};

/**
 * Stand fuer /board/members/import: juengster Import (auch ein Fehler), dazu
 * die Abweichungen zwischen der zuletzt angeforderten fehlerfreien Podlist
 * und members_measurementpoint.
 *
 * @param {Queryable} db
 * @returns {Promise<{
 *   latest: null | { id: number, receivedAt: string, requestedAt: string | null, source: string, fileName: string,
 *                    rowCount: number, unknownCount: number, status: string, error: string },
 *   current: null | { id: number, receivedAt: string, requestedAt: string | null, fileName: string, rowCount: number },
 *   unknownIdentifiers: string[],
 *   activeWithoutPodlist: { identifier: string, memberNumber: number }[],
 *   endedByGrid: { identifier: string, memberNumber: number, activeUntil: string }[],
 * }>}
 */
export const getPodlistStatus = async (db) => {
    const latestResult = await db.query(
        `SELECT id, received_at, requested_at, source, file_name, row_count, unknown_count, status, error
           FROM members_podlistimport
          ORDER BY received_at DESC, id DESC
          LIMIT 1`
    );
    // "aktuell" ist die zuletzt angeforderte Liste (Zeitpunkt aus dem Betreff),
    // nicht die zuletzt verarbeitete: eine von Hand nachgetragene aeltere
    // Datei darf eine neuere nicht verdraengen
    const currentResult = await db.query(
        `SELECT id, received_at, requested_at, file_name, row_count
           FROM members_podlistimport
          WHERE status = 'ok'
          ORDER BY requested_at DESC NULLS LAST, received_at DESC, id DESC
          LIMIT 1`
    );
    const latestRow = latestResult.rows[0];
    const currentRow = currentResult.rows[0];
    const latest = latestRow
        ? {
              id: latestRow.id,
              receivedAt: toIso(latestRow.received_at),
              requestedAt: toIsoOrNull(latestRow.requested_at),
              source: latestRow.source,
              fileName: latestRow.file_name,
              rowCount: latestRow.row_count,
              unknownCount: latestRow.unknown_count,
              status: latestRow.status,
              error: latestRow.error,
          }
        : null;
    if (!currentRow) {
        return { latest, current: null, unknownIdentifiers: [], activeWithoutPodlist: [], endedByGrid: [] };
    }
    const current = {
        id: currentRow.id,
        receivedAt: toIso(currentRow.received_at),
        requestedAt: toIsoOrNull(currentRow.requested_at),
        fileName: currentRow.file_name,
        rowCount: currentRow.row_count,
    };
    const unknown = await db.query(
        `SELECT DISTINCT e.identifier
           FROM members_podlistentry e
          WHERE e.podlist_import_id = $1
            AND NOT EXISTS (SELECT 1 FROM members_measurementpoint mp WHERE mp.identifier = e.identifier)
          ORDER BY e.identifier`,
        [current.id]
    );
    const activeWithout = await db.query(
        `SELECT mp.identifier, m.identifier AS member_number
           FROM members_measurementpoint mp
           JOIN members_member m ON m.id = mp.member_id
          WHERE mp.status = 'ACTIVE'
            AND NOT EXISTS (SELECT 1 FROM members_podlistentry e WHERE e.podlist_import_id = $1 AND e.identifier = mp.identifier)
          ORDER BY m.identifier, mp.identifier`,
        [current.id]
    );
    // laut Netz beendet (juengstes Fenster geschlossen und vorbei), bei uns noch ACTIVE
    const ended = await db.query(
        `WITH last_window AS (
            SELECT DISTINCT ON (e.identifier) e.identifier, e.active_until
              FROM members_podlistentry e
             WHERE e.podlist_import_id = $1
             ORDER BY e.identifier, e.active_since DESC
         )
         SELECT mp.identifier, m.identifier AS member_number, w.active_until
           FROM last_window w
           JOIN members_measurementpoint mp ON mp.identifier = w.identifier
           JOIN members_member m ON m.id = mp.member_id
          WHERE mp.status = 'ACTIVE'
            AND w.active_until IS NOT NULL
            AND w.active_until < (now() AT TIME ZONE 'Europe/Vienna')::date
          ORDER BY w.active_until DESC, mp.identifier`,
        [current.id]
    );
    return {
        latest,
        current,
        unknownIdentifiers: unknown.rows.map((r) => r.identifier),
        activeWithoutPodlist: activeWithout.rows.map((r) => ({ identifier: r.identifier, memberNumber: Number(r.member_number) })),
        endedByGrid: ended.rows.map((r) => ({
            identifier: r.identifier,
            memberNumber: Number(r.member_number),
            activeUntil: toDateString(r.active_until),
        })),
    };
};

const toIso = (/** @type {Date | string} */ v) => (v instanceof Date ? v.toISOString() : String(v));
const toIsoOrNull = (/** @type {Date | string | null} */ v) => (v == null ? null : toIso(v));
// node-pg liefert date-Spalten als Date um lokale Mitternacht; lokale Getter verwenden
const toDateString = (/** @type {Date | string} */ v) =>
    v instanceof Date
        ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
        : String(v).slice(0, 10);
