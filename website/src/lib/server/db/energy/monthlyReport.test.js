import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importAllowsSending } from './monthlyReport.js';

// 15.11.2026 09:30 in Wien
const now = new Date('2026-11-15T08:30:00Z');

test('ohne Komplettimport geht kein Bericht hinaus', () => {
    assert.equal(importAllowsSending({ importedAt: null, started: false, now }), false);
    assert.equal(importAllowsSending({ importedAt: null, started: true, now }), false);
});

test('der Versand beginnt nur mit einem Import von heute', () => {
    assert.equal(importAllowsSending({ importedAt: new Date('2026-11-15T04:12:00Z'), started: false, now }), true);
    assert.equal(importAllowsSending({ importedAt: new Date('2026-11-14T04:12:00Z'), started: false, now }), false);
});

test('heute zaehlt in Europe/Vienna, nicht in UTC', () => {
    // 14.11. 23:30 UTC ist in Wien schon der 15.11.
    assert.equal(importAllowsSending({ importedAt: new Date('2026-11-14T23:30:00Z'), started: false, now }), true);
    // 14.11. 22:30 UTC ist in Wien noch der 14.11.
    assert.equal(importAllowsSending({ importedAt: new Date('2026-11-14T22:30:00Z'), started: false, now }), false);
});

test('ein begonnener Versand laeuft mit dem vorhandenen Import weiter', () => {
    assert.equal(importAllowsSending({ importedAt: new Date('2026-11-14T04:12:00Z'), started: true, now }), true);
});
