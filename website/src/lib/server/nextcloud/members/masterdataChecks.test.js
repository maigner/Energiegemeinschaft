// node --test src/lib/server/nextcloud/members/masterdataChecks.test.js
// Synthetische Zeilen wie aus XLSX.utils.sheet_to_json(sheet) des Blatts
// "Mitglieder"; Vorlage sind die Rust-Tests in
// eeg-tools/eegfaktura-datalib/src/eegfaktura/checks/tests/.
//
// Datumswerte als ISO-Strings (JJJJ-MM-TT, so liest sie auch der
// Rust-Loader), Excel-Serial und Date; die Schreibweise TT.MM.JJJJ wird
// hier nicht verwendet, weil cellToIsoDate in podlist/sheet.js dafuer
// Tag und Monat vertauscht (Stand 2026-11-01).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkMasterdata, describeMeterPointFinding, describeTransfer } from './masterdataChecks.js';

const ZP_A = 'AT0030000000000000000000030000001';
const ZP_B = 'AT0030000000000000000000030000002';

/**
 * Eine Sheet-Zeile mit sinnvollen Vorgaben.
 * @param {Record<string, any>} overrides
 */
const row = (overrides) => ({
    'Mit. Nr.': 1,
    'Name 1': 'Erika',
    'Name 2': 'Muster',
    'E-Mail': 'erika@example.org',
    'teilnahme als': 'PRIVATE',
    'Zählpunkt': ZP_A,
    'ZP-Status': 'ACTIVE',
    'registriert': '2024-01-01',
    'Bezugsrichtung': 'CONSUMPTION',
    'aktiviert': '2024-02-01',
    'deaktiviert': '',
    'Zp. Tarifname': 'Standard',
    ...overrides,
});

describe('Tarif und Aktivierungsdatum', () => {
    test('vollständige Zeilen liefern keine Befunde', () => {
        const checks = checkMasterdata([row({}), row({ 'Mit. Nr.': 2, 'Zählpunkt': ZP_B })]);
        assert.deepEqual(checks.missingSubscriptions, []);
        assert.deepEqual(checks.missingActivations, []);
        assert.deepEqual(checks.transfers, []);
        assert.equal(checks.hasIssues, false);
    });

    test('aktiver Zählpunkt ohne Tarif wird gemeldet, inaktiver nicht', () => {
        const checks = checkMasterdata([
            row({ 'Zp. Tarifname': '' }),
            row({ 'Mit. Nr.': 2, 'Zählpunkt': ZP_B, 'ZP-Status': 'INACTIVE', 'Zp. Tarifname': undefined }),
        ]);
        assert.deepEqual(checks.missingSubscriptions, [
            { identifier: ZP_A, memberNumber: '1', memberName: 'Erika Muster' },
        ]);
        assert.equal(checks.hasIssues, true);
        assert.equal(describeMeterPointFinding(checks.missingSubscriptions[0]), `${ZP_A} (Mitglied 1, Erika Muster)`);
    });

    test('nur Leerzeichen im Tarif gelten als fehlend', () => {
        const checks = checkMasterdata([row({ 'Zp. Tarifname': '   ' })]);
        assert.equal(checks.missingSubscriptions.length, 1);
    });

    test('aktiver Zählpunkt ohne Aktivierungsdatum wird gemeldet, PENDING nicht', () => {
        const checks = checkMasterdata([
            row({ 'aktiviert': undefined }),
            row({ 'Mit. Nr.': 2, 'Zählpunkt': ZP_B, 'ZP-Status': 'PENDING', 'aktiviert': '' }),
        ]);
        assert.deepEqual(checks.missingActivations, [
            { identifier: ZP_A, memberNumber: '1', memberName: 'Erika Muster' },
        ]);
        assert.equal(checks.hasIssues, true);
    });

    test('Excel-Serial und Date-Objekt zählen als vorhandenes Datum', () => {
        const checks = checkMasterdata([
            row({ 'aktiviert': 45323 }), // 2024-02-01
            row({ 'Mit. Nr.': 2, 'Zählpunkt': ZP_B, 'aktiviert': new Date(2024, 1, 1) }),
        ]);
        assert.deepEqual(checks.missingActivations, []);
    });

    test('Befunde sind nach Zählpunkt sortiert, Firmenname ersetzt fehlende Namen', () => {
        const checks = checkMasterdata([
            row({ 'Mit. Nr.': 2, 'Zählpunkt': ZP_B, 'Name 1': '', 'Name 2': '', 'Firmenname': 'Beispiel GmbH', 'Zp. Tarifname': '' }),
            row({ 'Zp. Tarifname': '' }),
        ]);
        assert.deepEqual(checks.missingSubscriptions.map((f) => f.identifier), [ZP_A, ZP_B]);
        assert.equal(checks.missingSubscriptions[1].memberName, 'Beispiel GmbH');
    });

    test('Zeilen ohne Zählpunkt oder Mitgliedsnummer werden übergangen', () => {
        const checks = checkMasterdata([
            row({ 'Zählpunkt': '', 'Zp. Tarifname': '' }),
            row({ 'Mit. Nr.': undefined, 'Zp. Tarifname': '' }),
        ]);
        assert.equal(checks.hasIssues, false);
    });
});

describe('Besitzwechsel', () => {
    /**
     * Zeilen fuer ZP_A unter mehreren Besitzern.
     * @param {Array<[string | number, string, string | number | null, string | number | null]>} owners [Mit. Nr., Status, aktiviert, deaktiviert]
     */
    const owners = (owners) =>
        owners.map(([number, status, activated, deactivated]) =>
            row({
                'Mit. Nr.': number,
                'Name 1': `Person${number}`,
                'Name 2': 'Test',
                'ZP-Status': status,
                'aktiviert': activated ?? '',
                'deaktiviert': deactivated ?? '',
            }),
        );

    test('ein Besitzer ist kein Besitzwechsel', () => {
        const checks = checkMasterdata(owners([[1, 'ACTIVE', '2024-01-01', null]]));
        assert.deepEqual(checks.transfers, []);
    });

    test('derselbe Zählpunkt zweimal beim selben Mitglied ist kein Besitzwechsel', () => {
        const checks = checkMasterdata(owners([[1, 'INACTIVE', '2024-01-01', '2024-06-01'], [1, 'ACTIVE', '2024-07-01', null]]));
        assert.deepEqual(checks.transfers, []);
    });

    test('sauberer Wechsel: alter Besitzer vor dem neuen deaktiviert', () => {
        const checks = checkMasterdata(owners([
            [243, 'ACTIVE', '2025-07-23', null],
            [34, 'INACTIVE', '2024-06-06', '2025-07-17'],
        ]));
        assert.equal(checks.transfers.length, 1);
        const t = checks.transfers[0];
        assert.equal(t.identifier, ZP_A);
        // nach Aktivierungsdatum: alter Besitzer zuerst
        assert.deepEqual(t.owners.map((o) => o.memberNumber), ['34', '243']);
        assert.equal(t.valid, true);
        assert.deepEqual(t.problems, []);
        assert.equal(checks.hasIssues, false);
        assert.equal(
            describeTransfer(t),
            `${ZP_A}: 34 Person34 Test (INACTIVE, 06.06.2024 bis 17.07.2025) -> 243 Person243 Test (ACTIVE, ab 23.07.2025): ok`,
        );
    });

    test('Deaktivierung am Tag der nächsten Aktivierung ist sauber', () => {
        const checks = checkMasterdata(owners([
            [1, 'INACTIVE', '2024-01-01', '2024-06-01'],
            [2, 'ACTIVE', '2024-06-01', null],
        ]));
        assert.equal(checks.transfers[0].valid, true);
    });

    test('zwei gleichzeitig aktive Besitzer sind ungültig', () => {
        const checks = checkMasterdata(owners([
            [1, 'ACTIVE', '2024-01-01', null],
            [2, 'ACTIVE', '2025-01-01', null],
        ]));
        const t = checks.transfers[0];
        assert.equal(t.valid, false);
        assert.ok(t.problems.some((p) => p.includes('ACTIVE')));
        assert.ok(t.problems.some((p) => p.includes('überschneiden')));
        assert.equal(checks.hasIssues, true);
        assert.match(describeTransfer(t), /: ungültig: 2 Besitzer gleichzeitig ACTIVE; /);
    });

    test('überlappende Zeiträume sind ungültig (alter Besitzer nie deaktiviert)', () => {
        const checks = checkMasterdata(owners([
            [1, 'INACTIVE', '2024-01-01', null],
            [2, 'ACTIVE', '2025-01-01', null],
        ]));
        const t = checks.transfers[0];
        assert.equal(t.valid, false);
        assert.deepEqual(t.problems, ['Zeiträume überschneiden sich (alter Besitzer nicht vor der Aktivierung des neuen deaktiviert)']);
    });

    test('Deaktivierung nach der nächsten Aktivierung überschneidet sich', () => {
        const checks = checkMasterdata(owners([
            [1, 'INACTIVE', '2024-01-01', '2025-01-15'],
            [2, 'ACTIVE', '2025-01-01', null],
        ]));
        assert.equal(checks.transfers[0].valid, false);
    });

    test('offenes Ende 9999-12-31 oder 2999-12-31 gilt als nicht deaktiviert', () => {
        for (const sentinel of ['9999-12-31', '2999-12-31', 2958465 /* Excel-Serial 9999-12-31 */]) {
            const checks = checkMasterdata(owners([
                [1, 'INACTIVE', '2024-01-01', sentinel],
                [2, 'ACTIVE', '2025-01-01', null],
            ]));
            const t = checks.transfers[0];
            assert.equal(t.owners[0].deactivated, null, `Sentinel ${sentinel}`);
            assert.equal(t.valid, false, `Sentinel ${sentinel}`);
        }
    });

    test('fehlendes Aktivierungsdatum zählt als offener Anfang und sortiert zuerst', () => {
        const checks = checkMasterdata(owners([
            [2, 'ACTIVE', '2025-01-01', null],
            [1, 'INACTIVE', null, '2024-06-01'],
        ]));
        const t = checks.transfers[0];
        assert.deepEqual(t.owners.map((o) => o.memberNumber), ['1', '2']);
        assert.equal(t.valid, true);
        assert.match(describeTransfer(t), /1 Person1 Test \(INACTIVE, bis 01\.06\.2024\)/);
    });

    test('zwei Besitzer ohne Datum überschneiden sich', () => {
        const checks = checkMasterdata(owners([
            [1, 'INACTIVE', null, null],
            [2, 'ACTIVE', null, null],
        ]));
        const t = checks.transfers[0];
        assert.equal(t.valid, false);
        assert.match(describeTransfer(t), /ohne Datum/);
    });

    test('Besitzwechsel sind nach Zählpunkt sortiert', () => {
        const checks = checkMasterdata([
            ...owners([[1, 'INACTIVE', '2024-01-01', '2024-06-01'], [2, 'ACTIVE', '2024-07-01', null]]).map((r) => ({ ...r, 'Zählpunkt': ZP_B })),
            ...owners([[3, 'INACTIVE', '2024-01-01', '2024-06-01'], [4, 'ACTIVE', '2024-07-01', null]]),
        ]);
        assert.deepEqual(checks.transfers.map((t) => t.identifier), [ZP_A, ZP_B]);
    });
});
