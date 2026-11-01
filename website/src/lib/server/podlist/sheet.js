// Zaehlpunktliste (Podlist) von Netz OOe lesen, wie EEG-Faktura sie nach einer
// Anforderung als Mail-Anhang schickt (`RC101533_<JJJJMMTT-HHMM>_ZP_PODLIST.xlsx`,
// Betreff `RC101533 Zaehlpunktliste <JJJJMMTT-HHMM>`). Blatt `ZP-List`, eine
// Zeile je Aktivierungsfenster: ein Zaehlpunkt steht mehrmals darin, wenn
// sich der Teilnahmefaktor geaendert hat (altes Fenster endet, neues beginnt
// am Folgetag). Das Ende 9999-12-31 (auch 2999-12-31) heisst "offen".
//
// Spalten werden ueber die Kopfzeile aufgeloest, nicht ueber Positionen
// (der Masterdata-Export hat 2026-11 Spalten eingeschoben, siehe eeg-tools).
// Reines Modul ohne SvelteKit-Importe, damit scripts/podlist-fetch.js es
// ohne Server nutzen kann.

import * as XLSX from 'xlsx';

export const SHEET_NAME = 'ZP-List';

export const COLUMNS = {
    number: 'Nr.',
    identifier: 'Zählpunktname',
    direction: 'Bezugsrichtung',
    participationFactor: 'Teilnahme-faktor',
    activated: 'aktiviert',
    activeSince: 'aktiv seit',
    activeUntil: 'aktiv bis',
};

const REQUIRED = ['identifier', 'direction', 'participationFactor', 'activated', 'activeSince', 'activeUntil'];
const DIRECTIONS = new Set(['CONSUMPTION', 'GENERATION']);
// AT + 31 Ziffern, wie members_measurementpoint.identifier
const IDENTIFIER = /^AT\d{31}$/;
const OPEN_END_YEAR = 2999;

/**
 * @typedef {{
 *   rowNo: number,
 *   identifier: string,
 *   direction: string,
 *   participationFactor: number,
 *   activated: string,
 *   activeSince: string,
 *   activeUntil: string | null,
 * }} PodlistEntry  Datumsangaben als JJJJ-MM-TT; activeUntil null = offen
 */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * Zellenwert als JJJJ-MM-TT. xlsx liefert mit cellDates Date-Objekte um
 * lokale Mitternacht (lokale Getter, nie toISOString: das wuerde in UTC auf
 * den Vortag kippen); Zahlen sind Excel-Serials, Strings TT.MM.JJJJ oder ISO.
 * @param {unknown} value
 * @returns {string | null} null, wenn leer oder nicht lesbar
 */
export const cellToIsoDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    if (typeof value === 'number') {
        const d = XLSX.SSF.parse_date_code(value);
        return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null;
    }
    const text = String(value).trim();
    let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
    if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
};

/** @param {string} isoDate */
const isOpenEnd = (isoDate) => Number(isoDate.slice(0, 4)) >= OPEN_END_YEAR;

/**
 * Anforderungszeitpunkt aus Betreff oder Dateiname (`20261101-1028`).
 * @param {string | null | undefined} text
 * @returns {string | null} `JJJJ-MM-TT HH:MM` (lokale Zeit, Europe/Vienna) oder null
 */
export const requestedAtFromText = (text) => {
    const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(text ?? '');
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
};

/**
 * Dateiname fuer die Ablage: Zeitstempel voran, damit Nextcloud-Listen
 * chronologisch sortieren und die Datei eindeutig bleibt.
 * @param {string | null} requestedAt  aus requestedAtFromText
 * @param {string} fallbackName
 */
export const archiveFileName = (requestedAt, fallbackName) => {
    const stamp = requestedAt
        ? requestedAt.replace(/[-: ]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')
        : null;
    const base = (fallbackName.split('/').pop() ?? '').split('\\').pop() || 'ZP_PODLIST.xlsx';
    if (!stamp || base.includes(stamp)) return base;
    return `${stamp}_${base}`;
};

/**
 * Blatt `ZP-List` eines Podlist-Workbooks in Fenster je Zaehlpunkt verwandeln.
 * Wirft bei fehlendem Blatt oder fehlenden Spalten (dann ist der Anhang
 * keine Podlist); einzelne unlesbare Zeilen landen in `warnings`.
 *
 * @param {Buffer | Uint8Array} buffer
 * @returns {{ entries: PodlistEntry[], warnings: string[] }}
 */
export const parsePodlistSheet = (buffer) => {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) {
        throw new Error(`Blatt "${SHEET_NAME}" fehlt (vorhanden: ${workbook.SheetNames.join(', ') || 'keines'})`);
    }
    /** @type {Record<string, unknown>[]} */
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const headers = new Set(rows.length ? Object.keys(rows[0]) : readHeaderRow(sheet));
    const missing = REQUIRED.map((key) => COLUMNS[/** @type {keyof COLUMNS} */ (key)]).filter((h) => !headers.has(h));
    if (missing.length) {
        throw new Error(`Spalten fehlen im Blatt "${SHEET_NAME}": ${missing.join(', ')}`);
    }

    /** @type {PodlistEntry[]} */
    const entries = [];
    /** @type {string[]} */
    const warnings = [];
    rows.forEach((row, index) => {
        const rowNo = index + 2; // Kopfzeile ist Zeile 1
        const identifier = String(row[COLUMNS.identifier] ?? '').trim();
        if (!identifier) return; // Leerzeile
        if (!IDENTIFIER.test(identifier)) {
            warnings.push(`Zeile ${rowNo}: Zählpunkt "${identifier.slice(0, 40)}" hat nicht das Format AT + 31 Ziffern, übersprungen`);
            return;
        }
        const direction = String(row[COLUMNS.direction] ?? '').trim().toUpperCase();
        if (!DIRECTIONS.has(direction)) {
            warnings.push(`Zeile ${rowNo}: Bezugsrichtung "${direction}" unbekannt, übersprungen`);
            return;
        }
        const factor = Number(row[COLUMNS.participationFactor]);
        if (!Number.isInteger(factor) || factor < 0 || factor > 100) {
            warnings.push(`Zeile ${rowNo}: Teilnahmefaktor "${row[COLUMNS.participationFactor]}" ungültig, übersprungen`);
            return;
        }
        const activated = cellToIsoDate(row[COLUMNS.activated]);
        const activeSince = cellToIsoDate(row[COLUMNS.activeSince]);
        const activeUntilRaw = cellToIsoDate(row[COLUMNS.activeUntil]);
        if (!activated || !activeSince || !activeUntilRaw) {
            warnings.push(`Zeile ${rowNo}: Datum fehlt oder unlesbar (${[activated, activeSince, activeUntilRaw].join(' / ')}), übersprungen`);
            return;
        }
        entries.push({
            rowNo,
            identifier,
            direction,
            participationFactor: factor,
            activated,
            activeSince,
            activeUntil: isOpenEnd(activeUntilRaw) ? null : activeUntilRaw,
        });
    });
    return { entries, warnings };
};

/** Kopfzeile eines leeren Blatts (sheet_to_json liefert dann keine Keys). */
const readHeaderRow = (/** @type {XLSX.WorkSheet} */ sheet) => {
    /** @type {unknown[][]} */
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    return (matrix[0] ?? []).map((v) => String(v ?? '').trim());
};
