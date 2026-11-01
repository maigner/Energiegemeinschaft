// Logische Pruefungen des EEG-Faktura-Masterdata-Sheets, portiert aus
// eeg-tools/eegfaktura-datalib/src/eegfaktura/checks/mod.rs
// (MasterdataChecks und OwnershipChecks), damit der Vorstand die Befunde
// direkt auf /board/members/import sieht, ohne den Checker von Hand zu
// starten.
//
// Drei Pruefungen auf dem Sheet "Mitglieder" (eine Zeile je Zaehlpunkt):
//
// - Aktive Zaehlpunkte ohne Tarif (`Zp. Tarifname` leer): EEG-Faktura
//   rechnet sie nicht ab.
// - Aktive Zaehlpunkte ohne Aktivierungsdatum (`aktiviert` leer): das
//   Aktivierungsfenster fehlt, der Energy-Report kann sie nicht zuordnen.
// - Besitzwechsel: ein Zaehlpunkt steht unter mehreren Mitgliedsnummern.
//   Das ist normal (Wohnungswechsel, Uebergabe), aber nur sauber, wenn die
//   aktiven Zeitraeume sich nicht ueberschneiden (ein gemeinsamer Tag am
//   Rand ist erlaubt) und hoechstens ein Besitzer gerade ACTIVE ist.
//
// Datumswerte kommen aus sheet_to_json je nach Leseart als Excel-Serial,
// Date oder String TT.MM.JJJJ; cellToIsoDate normalisiert auf JJJJ-MM-TT.
// Offene Enden (Jahr 2999 oder 9999) gelten als "kein Ende".
//
// Bewusst ohne $lib/$env-Importe, damit die Pruefungen ohne SvelteKit
// testbar bleiben (masterdataChecks.test.js, `npm test`).

import { cellToIsoDate } from '../../podlist/sheet.js';

const ACTIVE = 'ACTIVE';
const OPEN_END_YEAR = 2999;
// Vergleichswerte fuer offene Zeitraeume; ISO-Datumsstrings sortieren lexikalisch
const DATE_MIN = '0000-00-00';
const DATE_MAX = '9999-99-99';

/**
 * @typedef {{ identifier: string, memberNumber: string, memberName: string }} MeterPointFinding
 *   Ein Zaehlpunkt mit dem Mitglied, unter dem er im Sheet steht.
 *
 * @typedef {{
 *   memberNumber: string,
 *   memberName: string,
 *   status: string,
 *   activated: string | null,
 *   deactivated: string | null,
 * }} OwnerRecord  Eine Zeile des Sheets fuer einen Zaehlpunkt; Datumswerte
 *   JJJJ-MM-TT, deactivated null = offen (leer oder Sentinel 2999/9999)
 *
 * @typedef {{
 *   identifier: string,
 *   owners: OwnerRecord[],
 *   valid: boolean,
 *   problems: string[],
 * }} OwnershipTransfer  Zaehlpunkt unter mehreren Mitgliedsnummern, Besitzer
 *   nach Aktivierungsdatum (ohne Datum zuerst); problems leer, wenn valid
 *
 * @typedef {{
 *   missingSubscriptions: MeterPointFinding[],
 *   missingActivations: MeterPointFinding[],
 *   transfers: OwnershipTransfer[],
 *   hasIssues: boolean,
 * }} MasterdataChecks  hasIssues: mindestens ein Befund (saubere
 *   Besitzwechsel zaehlen nicht)
 */

/** @param {unknown} value */
const text = (value) => String(value ?? '').trim();

/** @param {string} isoDate */
const isOpenEnd = (isoDate) => Number(isoDate.slice(0, 4)) >= OPEN_END_YEAR;

/**
 * Anzeigename wie im Rust-Checker: Vorname Nachname, sonst Firmenname,
 * sonst die Mitgliedsnummer.
 * @param {Record<string, any>} row
 * @param {string} memberNumber
 */
const memberDisplayName = (row, memberNumber) => {
    const full = [row['Name 1'], row['Name 2']].map(text).filter(Boolean).join(' ');
    if (full) return full;
    return text(row['Firmenname']) || memberNumber;
};

/**
 * Mitgliedsnummern numerisch vergleichen, wenn beide Zahlen sind, sonst
 * als Text.
 * @param {string} a
 * @param {string} b
 */
const compareMemberNumbers = (a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && a !== '' && b !== '') return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Ueberschneiden sich zwei der aktiven Zeitraeume? Jeder laeuft von
 * activated (offen, wenn leer) bis deactivated (offen, wenn leer). Ein
 * gemeinsamer Randtag (Deaktivierung am Tag der naechsten Aktivierung)
 * zaehlt nicht als Ueberschneidung.
 * @param {OwnerRecord[]} owners
 */
const ownersOverlap = (owners) => {
    const intervals = owners.map((o) => ({ start: o.activated ?? DATE_MIN, end: o.deactivated ?? DATE_MAX }));
    for (let i = 0; i < intervals.length; i++) {
        for (let j = i + 1; j < intervals.length; j++) {
            const a = intervals[i];
            const b = intervals[j];
            if (a.start < b.end && b.start < a.end) return true;
        }
    }
    return false;
};

/**
 * Alle drei Pruefungen ueber die Zeilen des Sheets "Mitglieder".
 *
 * Zeilen ohne Zaehlpunkt oder ohne Mitgliedsnummer werden uebergangen.
 * Steht dasselbe Paar Mitglied/Zaehlpunkt mehrmals im Sheet, zaehlt die
 * letzte Zeile (wie die HashMap im Rust-Loader).
 *
 * @param {Array<Record<string, any>>} rows Zeilen aus XLSX.utils.sheet_to_json(sheet)
 * @returns {MasterdataChecks}
 */
export function checkMasterdata(rows) {
    /** @type {Map<string, { identifier: string, owner: OwnerRecord, subscription: string }>} */
    const records = new Map();
    for (const row of rows) {
        const identifier = text(row['Zählpunkt']);
        const memberNumber = text(row['Mit. Nr.']);
        if (!identifier || !memberNumber) continue;
        const deactivated = cellToIsoDate(row['deaktiviert']);
        records.set(`${memberNumber}|${identifier}`, {
            identifier,
            subscription: text(row['Zp. Tarifname']),
            owner: {
                memberNumber,
                memberName: memberDisplayName(row, memberNumber),
                status: text(row['ZP-Status']).toUpperCase(),
                activated: cellToIsoDate(row['aktiviert']),
                deactivated: deactivated && !isOpenEnd(deactivated) ? deactivated : null,
            },
        });
    }

    /** @type {MeterPointFinding[]} */
    const missingSubscriptions = [];
    /** @type {MeterPointFinding[]} */
    const missingActivations = [];
    /** @type {Map<string, OwnerRecord[]>} */
    const byIdentifier = new Map();
    for (const { identifier, owner, subscription } of records.values()) {
        const finding = { identifier, memberNumber: owner.memberNumber, memberName: owner.memberName };
        if (owner.status === ACTIVE && !subscription) missingSubscriptions.push(finding);
        if (owner.status === ACTIVE && !owner.activated) missingActivations.push(finding);
        const owners = byIdentifier.get(identifier) ?? [];
        byIdentifier.set(identifier, owners);
        owners.push(owner);
    }

    /** @param {MeterPointFinding} a @param {MeterPointFinding} b */
    const byPoint = (a, b) =>
        a.identifier.localeCompare(b.identifier) || compareMemberNumbers(a.memberNumber, b.memberNumber);
    missingSubscriptions.sort(byPoint);
    missingActivations.sort(byPoint);

    /** @type {OwnershipTransfer[]} */
    const transfers = [];
    for (const [identifier, owners] of byIdentifier) {
        if (owners.length < 2) continue;
        // nach Aktivierungsdatum (ohne Datum zuerst), dann Mitgliedsnummer
        owners.sort((a, b) => {
            const da = a.activated ?? DATE_MIN;
            const db = b.activated ?? DATE_MIN;
            if (da !== db) return da < db ? -1 : 1;
            return compareMemberNumbers(a.memberNumber, b.memberNumber);
        });
        /** @type {string[]} */
        const problems = [];
        const activeCount = owners.filter((o) => o.status === ACTIVE).length;
        if (activeCount > 1) problems.push(`${activeCount} Besitzer gleichzeitig ACTIVE`);
        if (ownersOverlap(owners)) {
            problems.push('Zeiträume überschneiden sich (alter Besitzer nicht vor der Aktivierung des neuen deaktiviert)');
        }
        transfers.push({ identifier, owners, valid: problems.length === 0, problems });
    }
    transfers.sort((a, b) => a.identifier.localeCompare(b.identifier));

    return {
        missingSubscriptions,
        missingActivations,
        transfers,
        hasIssues:
            missingSubscriptions.length > 0 ||
            missingActivations.length > 0 ||
            transfers.some((t) => !t.valid),
    };
}

/** @param {string | null} isoDate JJJJ-MM-TT */
const formatDate = (isoDate) => {
    if (!isoDate) return null;
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
};

/**
 * Eine Zeile fuer die Seite: Zaehlpunkt und Mitglied.
 * @param {MeterPointFinding} finding
 */
export function describeMeterPointFinding(finding) {
    return `${finding.identifier} (Mitglied ${finding.memberNumber}, ${finding.memberName})`;
}

/**
 * Zeitraum eines Besitzers: "ab 23.07.2025", "06.06.2024 bis 17.07.2025",
 * "bis 17.07.2025" oder "ohne Datum".
 * @param {OwnerRecord} owner
 */
const describePeriod = (owner) => {
    const from = formatDate(owner.activated);
    const to = formatDate(owner.deactivated);
    if (from && to) return `${from} bis ${to}`;
    if (from) return `ab ${from}`;
    if (to) return `bis ${to}`;
    return 'ohne Datum';
};

/**
 * Eine Zeile je Besitzwechsel: Zaehlpunkt, Besitzer in zeitlicher Reihenfolge
 * mit Status und Zeitraum, dann "ok" oder die Gruende.
 * @param {OwnershipTransfer} transfer
 */
export function describeTransfer(transfer) {
    const owners = transfer.owners
        .map((o) => `${o.memberNumber} ${o.memberName} (${o.status || 'ohne Status'}, ${describePeriod(o)})`)
        .join(' -> ');
    const verdict = transfer.valid ? 'ok' : `ungültig: ${transfer.problems.join('; ')}`;
    return `${transfer.identifier}: ${owners}: ${verdict}`;
}
