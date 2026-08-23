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
        // Die Provisionierungsspalten (Migration 0030) sind NOT NULL ohne
        // DEFAULT - am klassischen Weg bleiben sie leer.
        await db.query(
            `INSERT INTO members_openhabstatus
                (member_id, token, name, created_at, last_seen, data,
                 inverter_type, inverter_username, inverter_password, wg_address, wg_public_key,
                 cloud_uuid, cloud_secret, cloud_username, cloud_password, cloud_account_state,
                 cloud_account_error, mail_alias_state, linux_password, wifi_ssid, wifi_password,
                 setup_phase, setup_message)
             VALUES ($1, $2, '', now(), NULL, '{}',
                     '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '')`,
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
 * Die Anlagen melden minuetlich: schlanke Meldungen mit den Momentanwerten
 * und alle 5 Minuten eine volle Meldung, die zusaetzlich Log, Versionen,
 * apt-Updates und Systemzustand traegt (erkennbar am Feld `versions`).
 * Volle Meldungen ersetzen den gespeicherten Stand komplett; schlanke
 * werden hineingemischt, damit die zuletzt voll gemeldeten Felder am
 * Dashboard sichtbar bleiben. Aeltere IBM-Pakete melden alle 5 Minuten
 * ausschliesslich volle Meldungen und verhalten sich damit wie bisher.
 *
 * @param {string} token
 * @param {string} name - Anlagenname aus ibm.conf, aktualisiert die Anzeige
 * @param {Record<string, any>} data
 * @returns {Promise<boolean>} true wenn gespeichert, false bei unbekanntem Token
 */
export const pushOpenhabStatus = async (token, name, data) => {
    const isFull = Object.prototype.hasOwnProperty.call(data, 'versions');
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `UPDATE members_openhabstatus
                SET last_seen = now(),
                    name = COALESCE(NULLIF($2, ''), name),
                    data = CASE WHEN $4 THEN $3::jsonb ELSE data || $3::jsonb END
              WHERE token = $1
             RETURNING id`,
            [token, name, JSON.stringify(data), isFull]
        );
        if (result.rowCount === 0) {
            return false;
        }
        // Nur volle Meldungen wandern in den Verlauf; daraus entstehen die
        // Diagramme auf der Detailseite (15-Minuten-Mittel, das 5-Minuten-
        // Raster reicht dafuer) - so waechst die Tabelle trotz minuetlicher
        // Pushes nicht schneller als bisher. Alte Zeilen raeumt der
        // taegliche Cron-Job auf (pruneOpenhabStatusHistory). Die
        // Logmeldungen der Anlage (log_entries) bleiben aussen vor: sie
        // wuerden jede Zeile um mehrere KB aufblasen und die Diagramme
        // lesen sie nicht - angezeigt wird immer der Stand der letzten
        // Meldung.
        if (isFull) {
            const { log_entries, ...historyData } = data;
            await db.query(
                `INSERT INTO members_openhabstatushistory (status_id, time, data)
                 VALUES ($1, now(), $2)`,
                [result.rows[0].id, JSON.stringify(historyData)]
            );
        }
        return true;
    } finally {
        db.release();
    }
};

/**
 * Anlage zu einem Status-Token, fuer die individualisierte Ladefenster-API
 * (/api/ibm/ladefenster/v1): liefert die zuletzt gepushten Daten der Anlage
 * (geschaetzte Batteriekapazitaet und Ladeleistung), mit denen der Server
 * das Sperr-Ende je Anlage berechnet. null bei unbekanntem Token.
 *
 * @param {string} token
 * @returns {Promise<{ id: number, data: Record<string, any> } | null>}
 */
export const getOpenhabPlantByToken = async (token) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT id, data FROM members_openhabstatus WHERE token = $1`,
            [token]
        );
        return result.rows[0] ?? null;
    } finally {
        db.release();
    }
};

/**
 * Verlauf einer Anlage fuer die Diagramme der Detailseite, gemittelt auf
 * 15-Minuten-Fenster. Vorzeichen wie vom Fronius geliefert: Batterie
 * positiv = Entladen, Netz negativ = Einspeisung. Daraus je Messpunkt
 * abgeleitet (vor der Mittelung): battery_to_grid_w = Anteil der
 * Batterie-Entladung, der ins Netz fliesst (min aus Entladung und
 * Einspeisung), grid_to_battery_w = Netto-Ladung aus dem Netz (min aus
 * Ladung und Bezug; soll dauerhaft 0 sein). Die Systemwerte
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
                    avg(CASE WHEN jsonb_typeof(data->'battery_power_w') = 'number'
                              AND jsonb_typeof(data->'grid_power_w') = 'number'
                             THEN LEAST(GREATEST((data->>'battery_power_w')::float, 0),
                                        GREATEST(-(data->>'grid_power_w')::float, 0)) END) AS battery_to_grid_w,
                    avg(CASE WHEN jsonb_typeof(data->'battery_power_w') = 'number'
                              AND jsonb_typeof(data->'grid_power_w') = 'number'
                             THEN LEAST(GREATEST(-(data->>'battery_power_w')::float, 0),
                                        GREATEST((data->>'grid_power_w')::float, 0)) END) AS grid_to_battery_w,
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
 * Beobachtete Spitzen-Ladeleistung einer Anlage in kW, aus dem Verlauf der
 * letzten `days` Tage: je Tag die hoechste gemeldete Batterieladung
 * (battery_power_w negativ = Laden), davon das obere Quartil - also die
 * Ladeleistung an einem typischen guten Tag, ohne dass ein einzelner
 * Ausreisser zaehlt. Sie bestimmt zusammen mit der gelernten Ladeleistung
 * das Nacht-Entladebudget (Token-API /api/ibm/ladefenster): die gelernte
 * Rate ist bewusst die untere Huellkurve (fuer das Sperr-Ende richtig),
 * unterschaetzt aber, was ein sonniger Tag wieder in die Batterie laedt.
 * null, wenn weniger als 3 Tage mit Ladung vorliegen.
 *
 * @param {number} statusId - members_openhabstatus.id
 * @param {number} [days]
 * @returns {Promise<number | null>}
 */
export const getObservedPeakChargeKw = async (statusId, days = 7) => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `WITH daily AS (
                SELECT (time AT TIME ZONE 'Europe/Vienna')::date AS d,
                       MAX(-(data->>'battery_power_w')::float) AS peak_w
                  FROM members_openhabstatushistory
                 WHERE status_id = $1
                   AND time > now() - make_interval(days => $2)
                   AND jsonb_typeof(data->'battery_power_w') = 'number'
                 GROUP BY 1
                HAVING MAX(-(data->>'battery_power_w')::float) > 0
             )
             SELECT count(*)::int AS days,
                    percentile_cont(0.75) WITHIN GROUP (ORDER BY peak_w) AS peak_w
               FROM daily`,
            [statusId, days]
        );
        const row = result.rows[0];
        if (!row || row.days < 3 || row.peak_w == null) return null;
        return Math.round(Number(row.peak_w) / 100) / 10;
    } finally {
        db.release();
    }
};

/**
 * Summe der eingestellten maximalen Entladeleistung aller aktiven
 * IBM-Anlagen in kW (Hauptschalter ON, Entladung aktiv, in der letzten
 * Stunde gemeldet). Dient dem Entladestart der Nacht als Mass dafuer, wie
 * viel die Flotte abends ins Netz drueckt (siehe getTodayDischargeStart).
 * Eine Anlage ohne Einstellung zaehlt mit 3 kW.
 *
 * @returns {Promise<number>}
 */
export const getActiveFleetDischargeKw = async () => {
    const db = await middlewareDbConnection();
    try {
        const result = await db.query(
            `SELECT COALESCE(SUM(CASE WHEN jsonb_typeof(data->'max_entladeleistung_w') = 'number'
                                      THEN (data->>'max_entladeleistung_w')::float
                                      ELSE 3000 END), 0) / 1000 AS kw
               FROM members_openhabstatus
              WHERE last_seen > now() - interval '1 hour'
                AND data->>'hauptschalter' = 'ON'
                AND COALESCE(data->>'entladung_aktiv', 'ON') = 'ON'`
        );
        const kw = Number(result.rows[0]?.kw);
        return Number.isFinite(kw) ? kw : 0;
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
