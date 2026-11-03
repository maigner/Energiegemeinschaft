// Abrechnungspruefung: Datenstand je Zaehlpunkt fuer einen Zeitraum, direkt
// aus metering_measurement (Qualitaet seit Migration metering 0006) und den
// Aktivierungsfenstern in members_measurementpoint (Masterdata-Sheet,
// Energystore) bzw. members_podlistentry (Netz OOe). Ersetzt den Excel-
// Energy-Report plus eeg-tools-Checker (docs/eegfaktura-pruefung-automatisierung.md,
// Stufe 2 und 5). Alle Funktionen nehmen die DB als erstes Argument (Pool
// oder Client mit .query); die Bewertung der Zahlen liegt in
// src/lib/billingCheck.js (ohne DB).

const TZ = 'Europe/Vienna';

// Leitcode je Richtung: ein Wert je Viertelstunde reicht, um Luecken und
// L3 zu erkennen (Ids wie in monthlyReport.js METER)
const LEAD_CODE_CONSUMPTION = 193; // Gesamtverbrauch lt. Messung
const LEAD_CODE_GENERATION = 196; // Gesamte gemeinschaftliche Erzeugung

/**
 * @typedef {{
 *   identifier: string, direction: string, status: string,
 *   memberNumber: number, memberName: string, subscriptionName: string | null,
 *   activatedAt: string | null, deactivatedAt: string | null,
 *   windowStart: string, windowEnd: string,
 *   expectedCount: number, missingCount: number, missingDays: string[],
 *   l3Count: number, l3Days: string[],
 *   firstData: string | null, lastData: string | null,
 * }} PointCheckRow
 */

/**
 * Je Zaehlpunkt, der im Zeitraum (ganz oder teilweise) aktiv ist: erwartete
 * und fehlende Viertelstunden im aktiven Fenster, L3-Viertelstunden, erster
 * und letzter Wert. Ohne Aktivierungsdatum gilt ein ACTIVE-Zaehlpunkt ab
 * Zeitraumbeginn (wie im EEG-Faktura-Dialog). Tage in Europe/Vienna, der
 * Umstellungstag hat 92 bzw. 100 Viertelstunden.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} periodStart  JJJJ-MM-TT (erster Tag)
 * @param {string} periodEnd    JJJJ-MM-TT (letzter Tag)
 * @returns {Promise<PointCheckRow[]>}
 */
export async function getPointChecks(db, periodStart, periodEnd) {
    const result = await db.query(
        `WITH params AS (
            SELECT $1::date AS p_start, $2::date AS p_end
         ),
         points AS (
            SELECT mp.id, mp.identifier, mp.type, mp.status, mp.activated_at, mp.deactivated_at, mp.subscription_name,
                   m.identifier AS member_number,
                   COALESCE(NULLIF(TRIM(CONCAT_WS(' ', m.first_name, m.last_name)), ''), m.name) AS member_name,
                   GREATEST(COALESCE(mp.activated_at, p.p_start), p.p_start) AS win_start,
                   LEAST(COALESCE(mp.deactivated_at, p.p_end), p.p_end) AS win_end,
                   CASE WHEN mp.type = 'GENERATION' THEN $4::int ELSE $3::int END AS lead_code
              FROM members_measurementpoint mp
              JOIN members_member m ON m.id = mp.member_id
             CROSS JOIN params p
             WHERE (mp.deactivated_at IS NULL OR mp.deactivated_at >= p.p_start)
               AND (mp.status = 'ACTIVE' OR (mp.activated_at IS NOT NULL AND mp.activated_at <= p.p_end))
         ),
         days AS (
            SELECT pt.id AS point_id, d::date AS day,
                   (EXTRACT(EPOCH FROM (((d::date + 1)::timestamp AT TIME ZONE '${TZ}')
                                        - (d::date::timestamp AT TIME ZONE '${TZ}'))) / 900)::int AS expected
              FROM points pt
             CROSS JOIN LATERAL generate_series(pt.win_start::timestamp, pt.win_end::timestamp, interval '1 day') AS d
             WHERE pt.win_start <= pt.win_end
         ),
         actual AS (
            SELECT mm.measurement_point_id AS point_id,
                   (mm.timestamp AT TIME ZONE '${TZ}')::date AS day,
                   count(*) AS n,
                   count(*) FILTER (WHERE mm.quality = 3) AS n_l3,
                   min(mm.timestamp) AS first_ts,
                   max(mm.timestamp) AS last_ts
              FROM metering_measurement mm
              JOIN points pt ON pt.id = mm.measurement_point_id AND mm.meter_code_id = pt.lead_code
             CROSS JOIN params p
             WHERE mm.timestamp >= (p.p_start::timestamp AT TIME ZONE '${TZ}')
               AND mm.timestamp < ((p.p_end + 1)::timestamp AT TIME ZONE '${TZ}')
             GROUP BY 1, 2
         ),
         per_day AS (
            SELECT dd.point_id, dd.day, dd.expected,
                   COALESCE(a.n, 0) AS n, COALESCE(a.n_l3, 0) AS n_l3, a.first_ts, a.last_ts
              FROM days dd
              LEFT JOIN actual a ON a.point_id = dd.point_id AND a.day = dd.day
         )
         SELECT pt.identifier, pt.type AS direction, pt.status, pt.member_number, pt.member_name, pt.subscription_name,
                pt.activated_at::text AS activated_at, pt.deactivated_at::text AS deactivated_at,
                pt.win_start::text AS window_start, pt.win_end::text AS window_end,
                COALESCE(SUM(pd.expected), 0)::int AS expected_count,
                COALESCE(SUM(GREATEST(pd.expected - pd.n, 0)), 0)::int AS missing_count,
                COALESCE(array_agg(pd.day::text ORDER BY pd.day) FILTER (WHERE pd.n < pd.expected), '{}') AS missing_days,
                COALESCE(SUM(pd.n_l3), 0)::int AS l3_count,
                COALESCE(array_agg(pd.day::text ORDER BY pd.day) FILTER (WHERE pd.n_l3 > 0), '{}') AS l3_days,
                MIN(pd.first_ts) AS first_data, MAX(pd.last_ts) AS last_data
           FROM points pt
           LEFT JOIN per_day pd ON pd.point_id = pt.id
          GROUP BY pt.id, pt.identifier, pt.type, pt.status, pt.member_number, pt.member_name, pt.subscription_name,
                   pt.activated_at, pt.deactivated_at, pt.win_start, pt.win_end
          ORDER BY pt.member_number, pt.identifier`,
        [periodStart, periodEnd, LEAD_CODE_CONSUMPTION, LEAD_CODE_GENERATION]
    );
    return result.rows.map((r) => ({
        identifier: r.identifier,
        direction: r.direction,
        status: r.status,
        memberNumber: Number(r.member_number),
        memberName: r.member_name,
        subscriptionName: r.subscription_name,
        activatedAt: r.activated_at,
        deactivatedAt: r.deactivated_at,
        windowStart: r.window_start,
        windowEnd: r.window_end,
        expectedCount: r.expected_count,
        missingCount: r.missing_count,
        missingDays: r.missing_days,
        l3Count: r.l3_count,
        l3Days: r.l3_days,
        firstData: r.first_data ? new Date(r.first_data).toISOString() : null,
        lastData: r.last_data ? new Date(r.last_data).toISOString() : null,
    }));
}

/**
 * Summen des Zeitraums je Meter-Code aus daily_metering_quality (wird nach
 * jedem Import aufgefrischt), zugeordnet wie im EEG-Faktura-Dialog.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} periodStart
 * @param {string} periodEnd
 * @returns {Promise<{ produced: number, consumed: number, allocated: number, selfCovered: number, surplus: number, daysComplete: number, daysTotal: number }>}
 */
export async function getPeriodTotals(db, periodStart, periodEnd) {
    const sums = await db.query(
        `SELECT mc.description, SUM(q.sum_in_kwh)::float AS kwh
           FROM daily_metering_quality q
           JOIN metering_metercode mc ON mc.id = q.meter_code_id
          WHERE q.day BETWEEN $1::date AND $2::date
          GROUP BY mc.description`,
        [periodStart, periodEnd]
    );
    const days = await db.query(
        `SELECT count(DISTINCT q.day)::int AS days_total,
                count(DISTINCT q.day) FILTER (WHERE q.is_complete)::int AS days_complete
           FROM daily_metering_quality q
          WHERE q.day BETWEEN $1::date AND $2::date`,
        [periodStart, periodEnd]
    );
    const byDescription = (/** @type {(d: string) => boolean} */ match) =>
        sums.rows.filter((r) => match(String(r.description))).reduce((a, r) => a + Number(r.kwh), 0);
    return {
        consumed: byDescription((d) => d.startsWith('Gesamtverbrauch')),
        allocated: byDescription((d) => d.startsWith('Anteil gemeinschaftliche')),
        selfCovered: byDescription((d) => d.startsWith('Eigendeckung')),
        produced: byDescription((d) => d === 'Gesamte gemeinschaftliche Erzeugung'),
        surplus: byDescription((d) => d.startsWith('Gesamt/')),
        daysTotal: days.rows[0]?.days_total ?? 0,
        daysComplete: days.rows[0]?.days_complete ?? 0,
    };
}

/**
 * @typedef {{
 *   identifier: string, status: string, memberNumber: number, memberName: string,
 *   masterdataStart: string | null, masterdataEnd: string | null,
 *   podlistStart: string | null, podlistEnd: string | null, inPodlist: boolean,
 *   storeStart: string | null, storeEnd: string | null,
 * }} ActivationSources  Enddatum null = offen
 */

/**
 * Aktivierungsfenster je Zaehlpunkt aus den drei Quellen (Masterdata-Sheet,
 * Podlist von Netz OOe, Energystore) fuer den Vergleich in
 * src/lib/billingCheck.js. Enthaelt alle ACTIVE-Zaehlpunkte und alle
 * Zaehlpunkte der aktuellen Podlist.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<{ podlistDate: string | null, rows: ActivationSources[] }>}
 */
export async function getActivationSources(db) {
    const result = await db.query(
        `WITH current_podlist AS (
            SELECT id, requested_at, received_at
              FROM members_podlistimport
             WHERE status = 'ok'
             ORDER BY requested_at DESC NULLS LAST, received_at DESC, id DESC
             LIMIT 1
         ),
         pod AS (
            SELECT e.identifier,
                   MIN(e.activated) AS activated,
                   CASE WHEN bool_or(e.active_until IS NULL) THEN NULL ELSE MAX(e.active_until) END AS active_until
              FROM members_podlistentry e
              JOIN current_podlist c ON c.id = e.podlist_import_id
             GROUP BY e.identifier
         )
         SELECT mp.identifier, mp.status, m.identifier AS member_number,
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', m.first_name, m.last_name)), ''), m.name) AS member_name,
                mp.activated_at::text AS md_start, mp.deactivated_at::text AS md_end,
                pod.activated::text AS pod_start, pod.active_until::text AS pod_end,
                (pod.identifier IS NOT NULL) AS in_podlist,
                mp.store_period_begin::text AS store_start,
                CASE WHEN mp.store_period_end >= DATE '2999-01-01' THEN NULL ELSE mp.store_period_end END::text AS store_end,
                (SELECT COALESCE(requested_at, received_at)::text FROM current_podlist) AS podlist_date
           FROM members_measurementpoint mp
           JOIN members_member m ON m.id = mp.member_id
           LEFT JOIN pod ON pod.identifier = mp.identifier
          WHERE mp.status = 'ACTIVE' OR pod.identifier IS NOT NULL
          ORDER BY m.identifier, mp.identifier`
    );
    return {
        podlistDate: result.rows[0]?.podlist_date ?? null,
        rows: result.rows.map((r) => ({
            identifier: r.identifier,
            status: r.status,
            memberNumber: Number(r.member_number),
            memberName: r.member_name,
            masterdataStart: r.md_start,
            masterdataEnd: r.md_end,
            podlistStart: r.pod_start,
            podlistEnd: r.pod_end,
            inPodlist: Boolean(r.in_podlist),
            storeStart: r.store_start,
            storeEnd: r.store_end,
        })),
    };
}

/**
 * Pruefprotokoll je Zeitraum (metering_billingcheck): letzter Befund fuer
 * die Signal-Meldung bei Aenderung und die Markierung "abgerechnet".
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} periodStart
 * @param {string} periodEnd
 * @returns {Promise<null | { checkedAt: string | null, findingsHash: string | null, summary: any, billedAt: string | null, notifiedAt: string | null }>}
 */
export async function getBillingCheckRecord(db, periodStart, periodEnd) {
    const result = await db.query(
        `SELECT checked_at, findings_hash, summary, billed_at, notified_at
           FROM metering_billingcheck
          WHERE period_start = $1::date AND period_end = $2::date`,
        [periodStart, periodEnd]
    );
    const row = result.rows[0];
    if (!row) return null;
    const iso = (/** @type {Date | null} */ v) => (v ? new Date(v).toISOString() : null);
    return { checkedAt: iso(row.checked_at), findingsHash: row.findings_hash, summary: row.summary, billedAt: iso(row.billed_at), notifiedAt: iso(row.notified_at) };
}

/**
 * Befund speichern; `notified` stempelt zusaetzlich notified_at.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {{ periodStart: string, periodEnd: string, findingsHash: string, summary: unknown, notified?: boolean }} data
 */
export async function saveBillingCheckRecord(db, { periodStart, periodEnd, findingsHash, summary, notified = false }) {
    await db.query(
        `INSERT INTO metering_billingcheck (period_start, period_end, checked_at, findings_hash, summary, billed_at, notified_at)
         VALUES ($1::date, $2::date, now(), $3, $4::jsonb, NULL, CASE WHEN $5 THEN now() END)
         ON CONFLICT (period_start, period_end) DO UPDATE
            SET checked_at = now(), findings_hash = EXCLUDED.findings_hash, summary = EXCLUDED.summary,
                notified_at = CASE WHEN $5 THEN now() ELSE metering_billingcheck.notified_at END`,
        [periodStart, periodEnd, findingsHash, JSON.stringify(summary), notified]
    );
}

/**
 * Zeitraum als abgerechnet markieren (oder die Markierung aufheben).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} periodStart
 * @param {string} periodEnd
 * @param {boolean} billed
 */
export async function setBillingCheckBilled(db, periodStart, periodEnd, billed) {
    await db.query(
        `INSERT INTO metering_billingcheck (period_start, period_end, checked_at, findings_hash, summary, billed_at, notified_at)
         VALUES ($1::date, $2::date, now(), '', NULL, CASE WHEN $3 THEN now() END, NULL)
         ON CONFLICT (period_start, period_end) DO UPDATE
            SET billed_at = CASE WHEN $3 THEN now() ELSE NULL END`,
        [periodStart, periodEnd, billed]
    );
}

/**
 * Zeitraeume mit Protokoll (fuer die Auswahl auf der Seite).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @returns {Promise<{ periodStart: string, periodEnd: string, billedAt: string | null, checkedAt: string | null }[]>}
 */
export async function listBillingCheckRecords(db) {
    const result = await db.query(
        `SELECT period_start::text AS period_start, period_end::text AS period_end, billed_at, checked_at
           FROM metering_billingcheck ORDER BY period_start DESC LIMIT 12`
    );
    return result.rows.map((r) => ({
        periodStart: r.period_start,
        periodEnd: r.period_end,
        billedAt: r.billed_at ? new Date(r.billed_at).toISOString() : null,
        checkedAt: r.checked_at ? new Date(r.checked_at).toISOString() : null,
    }));
}

/**
 * Letzte Nachforderung im Protokoll vermerken (summary.lastRequest), damit
 * die Seite zeigt, was wann angefordert wurde.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} periodStart
 * @param {string} periodEnd
 * @param {{ at: string, points: number, requested: number | null, skipped: number }} info
 */
export async function noteBillingRequest(db, periodStart, periodEnd, info) {
    await db.query(
        `INSERT INTO metering_billingcheck (period_start, period_end, checked_at, findings_hash, summary, billed_at, notified_at)
         VALUES ($1::date, $2::date, now(), '', jsonb_build_object('lastRequest', $3::jsonb), NULL, NULL)
         ON CONFLICT (period_start, period_end) DO UPDATE
            SET summary = COALESCE(metering_billingcheck.summary, '{}'::jsonb) || jsonb_build_object('lastRequest', $3::jsonb)`,
        [periodStart, periodEnd, JSON.stringify(info)]
    );
}
