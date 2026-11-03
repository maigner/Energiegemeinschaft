// Bewertung der Abrechnungspruefung, ohne DB und ohne SvelteKit (Tests:
// src/lib/billingCheck.test.js). Die Zahlen kommen aus
// src/lib/server/db/energy/billingCheck.js, die Seite /board/energy/pruefung
// und der Cron checkBillingReadiness verwenden dieselbe Bewertung.

/** Erzeugung gilt als vollstaendig zugeteilt, wenn Erzeugung und Zuteilung um weniger als das abweichen (kWh). */
export const ALLOCATION_TOLERANCE_KWH = 0.01;

/** Tage nach Quartalsende, ab denen eine offene Pruefung angemahnt wird. */
export const REMINDER_DAYS_AFTER_PERIOD = 14;

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * Heutiges Datum in Europe/Vienna als JJJJ-MM-TT.
 * @param {Date} [now]
 */
export const todayVienna = (now = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/**
 * Letztes volles Quartal vor `today`.
 * @param {string} [today] JJJJ-MM-TT
 * @returns {{ start: string, end: string, label: string }}
 */
export const lastFullQuarter = (today = todayVienna()) => {
    const [y, m] = today.split('-').map(Number);
    const currentQuarter = Math.floor((m - 1) / 3); // 0..3
    let year = y;
    let quarter = currentQuarter - 1;
    if (quarter < 0) {
        quarter = 3;
        year -= 1;
    }
    return quarterPeriod(year, quarter + 1);
};

/**
 * @param {number} year
 * @param {number} quarter 1..4
 */
export const quarterPeriod = (year, quarter) => {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
    return {
        start: `${year}-${pad(startMonth)}-01`,
        end: `${year}-${pad(endMonth)}-${pad(endDay)}`,
        label: `Q${quarter} ${year}`,
    };
};

/**
 * Zeitraum aus Seitenparametern: `quartal=2026-Q3`, oder `von`/`bis`.
 * Ungueltiges faellt auf das letzte volle Quartal zurueck.
 * @param {{ quartal?: string | null, von?: string | null, bis?: string | null }} params
 * @param {string} [today]
 */
export const periodFromParams = (params, today = todayVienna()) => {
    const q = /^(\d{4})-Q([1-4])$/.exec(params.quartal ?? '');
    if (q) return quarterPeriod(Number(q[1]), Number(q[2]));
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (params.von && params.bis && iso.test(params.von) && iso.test(params.bis) && params.von <= params.bis) {
        return { start: params.von, end: params.bis, label: `${formatDay(params.von)} bis ${formatDay(params.bis)}` };
    }
    return lastFullQuarter(today);
};

/** JJJJ-MM-TT -> TT.MM.JJJJ */
export const formatDay = (/** @type {string} */ isoDate) => {
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
};

/** JJJJ-MM-TT -> TT.MM. */
const formatDayShort = (/** @type {string} */ isoDate) => {
    const [, m, d] = isoDate.split('-');
    return `${d}.${m}.`;
};

/** Folgetag von JJJJ-MM-TT. */
const nextDay = (/** @type {string} */ isoDate) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/**
 * Sortierte Tage zu Bereichen zusammenfassen: ["2026-10-01","2026-10-02","2026-10-03","2026-10-17"]
 * -> "01.10. bis 03.10., 17.10."
 * @param {string[]} days JJJJ-MM-TT, aufsteigend
 */
export const dayRanges = (days) => {
    /** @type {string[]} */
    const parts = [];
    let i = 0;
    while (i < days.length) {
        let j = i;
        while (j + 1 < days.length && days[j + 1] === nextDay(days[j])) j += 1;
        parts.push(i === j ? formatDayShort(days[i]) : `${formatDayShort(days[i])} bis ${formatDayShort(days[j])}`);
        i = j + 1;
    }
    return parts.join(', ');
};

/**
 * @typedef {'ok' | 'keine-daten' | 'luecke' | 'l3'} PointStatus
 * @typedef {import('./server/db/energy/billingCheck.js').PointCheckRow & { pointStatus: PointStatus, missingRanges: string, l3Ranges: string }} EvaluatedPoint
 */

/**
 * Status je Zaehlpunkt: keine Daten (gar kein Wert im Fenster), Luecke
 * (fehlende Viertelstunden), L3 (unsichere Werte), sonst ok.
 * @param {import('./server/db/energy/billingCheck.js').PointCheckRow} row
 * @returns {EvaluatedPoint}
 */
export const evaluatePoint = (row) => {
    /** @type {PointStatus} */
    let pointStatus = 'ok';
    if (row.expectedCount > 0 && row.missingCount >= row.expectedCount) pointStatus = 'keine-daten';
    else if (row.missingCount > 0) pointStatus = 'luecke';
    else if (row.l3Count > 0) pointStatus = 'l3';
    return { ...row, pointStatus, missingRanges: dayRanges(row.missingDays), l3Ranges: dayRanges(row.l3Days) };
};

/**
 * @typedef {{
 *   period: { start: string, end: string, label: string },
 *   points: EvaluatedPoint[],
 *   counts: { points: number, ok: number, gaps: number, noData: number, l3: number, missingDays: number },
 *   totals: import('./server/db/energy/billingCheck.js').PointCheckRow extends never ? never : {
 *     produced: number, consumed: number, allocated: number, selfCovered: number, surplus: number,
 *     daysComplete: number, daysTotal: number, allocationDiff: number, allocationOk: boolean },
 *   activation: { mismatches: ActivationMismatch[], missingInPodlist: ActivationMismatch[], podlistDate: string | null },
 *   overall: 'gruen' | 'gelb' | 'rot',
 * }} BillingEvaluation
 */

/**
 * @typedef {import('./server/db/energy/billingCheck.js').ActivationSources & {
 *   startAgree: boolean, endAgree: boolean, problems: string[] }} ActivationMismatch
 */

/**
 * Fenster aus den drei Quellen vergleichen: konkrete Startdaten muessen
 * gleich sein, Enddaten nach Normalisierung (offen = null) ebenso; eine
 * Quelle ohne Datum zaehlt nicht als Widerspruch (wie eeg-tools checks).
 * @param {import('./server/db/energy/billingCheck.js').ActivationSources} row
 * @returns {ActivationMismatch}
 */
export const evaluateActivation = (row) => {
    const starts = [row.masterdataStart, row.podlistStart, row.storeStart].filter((d) => d);
    const ends = [
        ['Masterdata', row.masterdataEnd],
        ['Podlist', row.inPodlist ? row.podlistEnd : undefined],
        ['Energystore', row.storeStart ? row.storeEnd : undefined],
    ].filter(([, d]) => d !== undefined);
    const startAgree = new Set(starts).size <= 1;
    // Enden nur vergleichen, wo die Quelle ueberhaupt bekannt ist (undefined = Quelle fehlt)
    const endValues = ends.map(([, d]) => d ?? 'offen');
    const endAgree = new Set(endValues).size <= 1;
    /** @type {string[]} */
    const problems = [];
    if (!startAgree) {
        problems.push(`Start: Masterdata ${row.masterdataStart ?? '-'}, Podlist ${row.podlistStart ?? '-'}, Energystore ${row.storeStart ?? '-'}`);
    }
    if (!endAgree) {
        problems.push(`Ende: ${ends.map(([name, d]) => `${name} ${d ?? 'offen'}`).join(', ')}`);
    }
    return { ...row, startAgree, endAgree, problems };
};

/**
 * Gesamtbewertung eines Zeitraums.
 * @param {{
 *   period: { start: string, end: string, label: string },
 *   points: import('./server/db/energy/billingCheck.js').PointCheckRow[],
 *   totals: { produced: number, consumed: number, allocated: number, selfCovered: number, surplus: number, daysComplete: number, daysTotal: number },
 *   activation: { podlistDate: string | null, rows: import('./server/db/energy/billingCheck.js').ActivationSources[] },
 * }} input
 * @returns {BillingEvaluation}
 */
export const evaluate = ({ period, points, totals, activation }) => {
    const evaluated = points.map(evaluatePoint);
    const counts = {
        points: evaluated.length,
        ok: evaluated.filter((p) => p.pointStatus === 'ok').length,
        gaps: evaluated.filter((p) => p.pointStatus === 'luecke').length,
        noData: evaluated.filter((p) => p.pointStatus === 'keine-daten').length,
        l3: evaluated.filter((p) => p.pointStatus === 'l3').length,
        missingDays: evaluated.reduce((a, p) => a + p.missingDays.length, 0),
    };
    const allocationDiff = Math.round((totals.produced - totals.allocated) * 1e6) / 1e6;
    const allocationOk = Math.abs(allocationDiff) < ALLOCATION_TOLERANCE_KWH;
    const activationRows = activation.rows.map(evaluateActivation);
    const mismatches = activationRows.filter((r) => r.problems.length > 0);
    const missingInPodlist = activation.podlistDate
        ? activationRows.filter((r) => r.status === 'ACTIVE' && !r.inPodlist)
        : [];
    /** @type {'gruen' | 'gelb' | 'rot'} */
    let overall = 'gruen';
    if (counts.gaps + counts.noData > 0) overall = 'rot';
    else if (counts.l3 > 0 || !allocationOk || mismatches.length > 0 || missingInPodlist.length > 0) overall = 'gelb';
    return {
        period,
        points: evaluated,
        counts,
        totals: { ...totals, allocationDiff, allocationOk },
        activation: { mismatches, missingInPodlist, podlistDate: activation.podlistDate },
        overall,
    };
};

/**
 * Nachforderungsliste fuer Netz OOe: ein Zaehlpunkt je Zeile mit den
 * fehlenden Tagen als Bereiche (ersetzt die sed/cut-Zeile des Checkers).
 * @param {BillingEvaluation} evaluation
 */
export const nachforderungText = (evaluation) =>
    evaluation.points
        .filter((p) => p.missingDays.length > 0)
        .map((p) => `${p.identifier}\t${p.memberName}\t${p.missingRanges}`)
        .join('\n');

/**
 * Stabiler Fingerabdruck des Befunds: aendert er sich, meldet der Cron.
 * Fehlende Tage, L3-Tage, Fensterwidersprueche und die Zuteilung gehen
 * ein, Zeitstempel nicht.
 * @param {BillingEvaluation} evaluation
 */
export const findingsFingerprint = (evaluation) =>
    JSON.stringify({
        gaps: evaluation.points
            .filter((p) => p.missingDays.length || p.l3Days.length)
            .map((p) => [p.identifier, p.missingDays, p.l3Days]),
        activation: evaluation.activation.mismatches.map((r) => [r.identifier, r.problems]),
        missingInPodlist: evaluation.activation.missingInPodlist.map((r) => r.identifier),
        allocationOk: evaluation.totals.allocationOk,
    });

/**
 * Kurztext fuer Signal.
 * @param {BillingEvaluation} evaluation
 * @param {{ reminder?: boolean, url?: string }} [options]
 */
export const signalSummary = (evaluation, { reminder = false, url = 'https://ischlstrom.org/board/energy/pruefung' } = {}) => {
    const c = evaluation.counts;
    const lines = [
        `${reminder ? 'Erinnerung: ' : ''}Abrechnungsprüfung ${evaluation.period.label}: ${evaluation.overall === 'gruen' ? 'grün' : evaluation.overall === 'gelb' ? 'gelb' : 'rot'}`,
        `${c.points} Zählpunkte, ${c.ok} ok, ${c.gaps} mit Lücken (${c.missingDays} Tage), ${c.noData} ohne Daten, ${c.l3} mit L3-Werten`,
    ];
    if (!evaluation.totals.allocationOk) {
        lines.push(`Zuteilung weicht ab: Erzeugung minus Zuteilung ${evaluation.totals.allocationDiff.toFixed(3)} kWh`);
    }
    if (evaluation.activation.mismatches.length) {
        lines.push(`${evaluation.activation.mismatches.length} Zählpunkte mit widersprüchlichen Aktivierungsfenstern`);
    }
    if (evaluation.activation.missingInPodlist.length) {
        lines.push(`${evaluation.activation.missingInPodlist.length} aktive Zählpunkte fehlen in der Podlist`);
    }
    lines.push(url);
    return lines.join('\n');
};

/**
 * Anfrage an EEG-Faktura `POST /meteringpoint/syncenergy` fuer die fehlenden
 * Tage: je Zaehlpunkt ein Eintrag mit dem umfassenden Bereich vom ersten bis
 * zum letzten fehlenden Tag (das Backend nimmt je Zaehlpunkt einen Zeitraum
 * und rundet auf ganze Tage). Zeitstempel sind Millisekunden der lokalen
 * Zeitzone des Prozesses (Europe/Vienna auf s1 und im Container).
 * @param {BillingEvaluation} evaluation
 * @returns {{ meteringPoints: { meter: string, direction: string, from: number, to: number }[], from: number, to: number } | null}
 *          null, wenn nichts fehlt
 */
export const buildSyncRequest = (evaluation) => {
    const startOfDay = (/** @type {string} */ day) => new Date(`${day}T00:00:00`).getTime();
    const endOfDay = (/** @type {string} */ day) => new Date(`${day}T23:59:59.999`).getTime();
    const meteringPoints = evaluation.points
        .filter((p) => p.missingDays.length > 0)
        .map((p) => ({
            meter: p.identifier,
            direction: p.direction,
            from: startOfDay(p.missingDays[0]),
            to: endOfDay(p.missingDays[p.missingDays.length - 1]),
        }));
    if (!meteringPoints.length) return null;
    return {
        meteringPoints,
        from: Math.min(...meteringPoints.map((m) => m.from)),
        to: Math.max(...meteringPoints.map((m) => m.to)),
    };
};
