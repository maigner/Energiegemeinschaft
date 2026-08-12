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
 * @param {Record<string, any>} data
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
        if (result.rowCount === 0) {
            return false;
        }
        // Jeder Push wird zusaetzlich als Verlauf abgelegt; daraus entstehen
        // die Diagramme auf der Detailseite. Alte Zeilen raeumt der taegliche
        // Cron-Job auf (pruneOpenhabStatusHistory). Die Logmeldungen der
        // Anlage (log_entries) bleiben aussen vor: sie wuerden jede
        // 5-Minuten-Zeile um mehrere KB aufblasen und die Diagramme lesen
        // sie nicht - angezeigt wird immer der Stand der letzten Meldung.
        const { log_entries, ...historyData } = data;
        await db.query(
            `INSERT INTO members_openhabstatushistory (status_id, time, data)
             VALUES ($1, now(), $2)`,
            [result.rows[0].id, JSON.stringify(historyData)]
        );
        return true;
    } finally {
        db.release();
    }
};

/**
 * Verlauf einer Anlage fuer die Diagramme der Detailseite, gemittelt auf
 * 15-Minuten-Fenster. Vorzeichen wie vom Fronius geliefert: Batterie
 * positiv = Entladen, Netz negativ = Einspeisung. Die Systemwerte
 * (data->'system') kommen als CPU-Temperatur und Belegung von SD-Karte,
 * RAM und Swap in Prozent mit; Anlagen mit altem IBM-Paket liefern NULL.
 *
 * @param {number} statusId - members_openhabstatus.id
 * @param {number} days - Zeitraum in Tagen
 */
export const getOpenhabStatusHistory = async (statusId, days) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT to_timestamp(floor(extract(epoch FROM time) / 900) * 900) AS bucket,
                    avg(CASE WHEN jsonb_typeof(data->'soc') = 'number' THEN (data->>'soc')::float END) AS soc,
                    avg(CASE WHEN jsonb_typeof(data->'battery_power_w') = 'number' THEN (data->>'battery_power_w')::float END) AS battery_power_w,
                    avg(CASE WHEN jsonb_typeof(data->'grid_power_w') = 'number' THEN (data->>'grid_power_w')::float END) AS grid_power_w,
                    avg(CASE WHEN jsonb_typeof(data->'system'->'cpu_temp_c') = 'number' THEN (data->'system'->>'cpu_temp_c')::float END) AS cpu_temp_c,
                    avg(CASE WHEN jsonb_typeof(data->'system'->'disk_used_pct') = 'number' THEN (data->'system'->>'disk_used_pct')::float END) AS disk_used_pct,
                    avg(CASE WHEN jsonb_typeof(data->'system'->'mem_total_mb') = 'number'
                              AND jsonb_typeof(data->'system'->'mem_used_mb') = 'number'
                              AND (data->'system'->>'mem_total_mb')::float > 0
                             THEN (data->'system'->>'mem_used_mb')::float
                                  / (data->'system'->>'mem_total_mb')::float * 100 END) AS mem_used_pct,
                    avg(CASE WHEN jsonb_typeof(data->'system'->'swap_total_mb') = 'number'
                              AND jsonb_typeof(data->'system'->'swap_used_mb') = 'number'
                              AND (data->'system'->>'swap_total_mb')::float > 0
                             THEN (data->'system'->>'swap_used_mb')::float
                                  / (data->'system'->>'swap_total_mb')::float * 100 END) AS swap_used_pct
               FROM members_openhabstatushistory
              WHERE status_id = $1
                AND time >= now() - make_interval(days => $2)
              GROUP BY bucket
              ORDER BY bucket`,
            [statusId, days]
        );
        return result.rows;
    } finally {
        db.release();
    }
};

/**
 * Loescht Verlaufszeilen, die aelter als 30 Tage sind (taeglicher Cron-Job).
 */
export const pruneOpenhabStatusHistory = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `DELETE FROM members_openhabstatushistory
              WHERE time < now() - interval '30 days'`
        );
        if (result.rowCount > 0) {
            console.log(`openhab status history pruned: ${result.rowCount} rows`);
        }
    } finally {
        db.release();
    }
};

/**
 * Eine Anlage samt letztem Status, fuer die Detailseite.
 *
 * @param {number} statusId - members_openhabstatus.id
 */
export const getOpenhabStatus = async (statusId) => {
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
              WHERE s.id = $1`,
            [statusId]
        );
        return result.rows[0] ?? null;
    } finally {
        db.release();
    }
};

/**
 * Anonyme Kennzahlen fuer die oeffentliche IBM-Seite: Anzahl der Anlagen,
 * die schon melden, davon aktuell online, und die Summe der geschaetzten
 * Batteriekapazitaeten. Keine Namen, keine Mitgliedsdaten.
 */
export const getPublicIbmStats = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT count(*) FILTER (WHERE last_seen IS NOT NULL)::int AS plants,
                    count(*) FILTER (WHERE last_seen > now() - interval '1 hour')::int AS online,
                    round(sum(CASE WHEN jsonb_typeof(data->'batterie_kapazitaet') = 'number'
                                   THEN (data->>'batterie_kapazitaet')::numeric END))::int AS capacity_kwh
               FROM members_openhabstatus`
        );
        return result.rows[0] ?? null;
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
