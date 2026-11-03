import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    lastFullQuarter, quarterPeriod, periodFromParams, dayRanges, evaluatePoint, evaluateActivation,
    evaluate, nachforderungText, findingsFingerprint, buildSyncRequest,
} from './billingCheck.js';

const point = (overrides = {}) => ({
    identifier: 'AT0030000000000000000000000000001', direction: 'CONSUMPTION', status: 'ACTIVE',
    memberNumber: 1, memberName: 'Test Person', subscriptionName: 'Tarif',
    activatedAt: '2026-01-01', deactivatedAt: null, windowStart: '2026-07-01', windowEnd: '2026-09-30',
    expectedCount: 96 * 92, missingCount: 0, missingDays: [], l3Count: 0, l3Days: [], firstData: null, lastData: null,
    ...overrides,
});

test('lastFullQuarter and quarterPeriod', () => {
    assert.deepEqual(lastFullQuarter('2026-11-01'), { start: '2026-07-01', end: '2026-09-30', label: 'Q3 2026' });
    assert.deepEqual(lastFullQuarter('2026-01-15'), { start: '2025-10-01', end: '2025-12-31', label: 'Q4 2025' });
    assert.equal(quarterPeriod(2024, 1).end, '2024-03-31');
    assert.equal(quarterPeriod(2026, 2).end, '2026-06-30');
});

test('periodFromParams', () => {
    assert.equal(periodFromParams({ quartal: '2026-Q2' }).start, '2026-04-01');
    assert.equal(periodFromParams({ von: '2026-05-01', bis: '2026-05-31' }).label, '01.05.2026 bis 31.05.2026');
    assert.equal(periodFromParams({ von: '2026-05-31', bis: '2026-05-01' }, '2026-11-01').label, 'Q3 2026');
    assert.equal(periodFromParams({ quartal: 'nonsense' }, '2026-11-01').label, 'Q3 2026');
});

test('dayRanges compresses consecutive days', () => {
    assert.equal(dayRanges(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-17']), '01.10. bis 03.10., 17.10.');
    assert.equal(dayRanges(['2026-10-31', '2026-11-01']), '31.10. bis 01.11.');
    assert.equal(dayRanges([]), '');
});

test('evaluatePoint statuses', () => {
    assert.equal(evaluatePoint(point()).pointStatus, 'ok');
    assert.equal(evaluatePoint(point({ missingCount: 5, missingDays: ['2026-07-03'] })).pointStatus, 'luecke');
    assert.equal(evaluatePoint(point({ missingCount: 96 * 92, missingDays: ['2026-07-01'] })).pointStatus, 'keine-daten');
    assert.equal(evaluatePoint(point({ l3Count: 3, l3Days: ['2026-08-01'] })).pointStatus, 'l3');
    // Luecke wiegt schwerer als L3
    assert.equal(evaluatePoint(point({ missingCount: 1, missingDays: ['2026-07-03'], l3Count: 3, l3Days: ['2026-08-01'] })).pointStatus, 'luecke');
});

test('evaluateActivation compares concrete dates and open ends', () => {
    const base = { identifier: 'AT1', status: 'ACTIVE', memberNumber: 1, memberName: 'x', inPodlist: true };
    const agree = evaluateActivation({ ...base, masterdataStart: '2026-01-01', masterdataEnd: null, podlistStart: '2026-01-01', podlistEnd: null, storeStart: '2026-01-01', storeEnd: null });
    assert.deepEqual(agree.problems, []);
    const startDiffers = evaluateActivation({ ...base, masterdataStart: '2026-01-01', masterdataEnd: null, podlistStart: '2026-01-02', podlistEnd: null, storeStart: null, storeEnd: null });
    assert.equal(startDiffers.startAgree, false);
    assert.equal(startDiffers.endAgree, true);
    const endDiffers = evaluateActivation({ ...base, masterdataStart: '2026-01-01', masterdataEnd: '2026-06-30', podlistStart: '2026-01-01', podlistEnd: null, storeStart: null, storeEnd: null });
    assert.equal(endDiffers.endAgree, false);
    // fehlende Quelle zaehlt nicht
    const missingSource = evaluateActivation({ ...base, inPodlist: false, masterdataStart: '2026-01-01', masterdataEnd: null, podlistStart: null, podlistEnd: null, storeStart: null, storeEnd: null });
    assert.deepEqual(missingSource.problems, []);
});

test('evaluate overall, nachforderung and fingerprint', () => {
    const input = {
        period: quarterPeriod(2026, 3),
        points: [point(), point({ identifier: 'AT0030000000000000000000000000002', memberName: 'Zwei', missingCount: 10, missingDays: ['2026-07-01', '2026-07-02'] })],
        totals: { produced: 100, consumed: 300, allocated: 99.995, selfCovered: 90, surplus: 10, daysComplete: 92, daysTotal: 92 },
        activation: { podlistDate: '2026-11-01', rows: [] },
    };
    const ev = evaluate(input);
    assert.equal(ev.overall, 'rot');
    assert.equal(ev.counts.gaps, 1);
    assert.equal(ev.totals.allocationOk, true);
    assert.equal(nachforderungText(ev), 'AT0030000000000000000000000000002\tZwei\t01.07. bis 02.07.');
    const fp1 = findingsFingerprint(ev);
    const fp2 = findingsFingerprint(evaluate({ ...input, totals: { ...input.totals, allocated: 50 } }));
    assert.notEqual(fp1, fp2);
    const green = evaluate({ ...input, points: [point()] });
    assert.equal(green.overall, 'gruen');
    const yellow = evaluate({ ...input, points: [point({ l3Count: 1, l3Days: ['2026-07-01'] })] });
    assert.equal(yellow.overall, 'gelb');
});

test('buildSyncRequest covers first to last missing day per point', () => {
    const ev = evaluate({
        period: quarterPeriod(2026, 3),
        points: [
            point(),
            point({ identifier: 'AT0030000000000000000000000000002', missingCount: 10, missingDays: ['2026-07-01', '2026-07-02', '2026-08-15'] }),
            point({ identifier: 'AT0030000000000000000000000000003', direction: 'GENERATION', missingCount: 1, missingDays: ['2026-09-30'] }),
        ],
        totals: { produced: 1, consumed: 1, allocated: 1, selfCovered: 1, surplus: 0, daysComplete: 0, daysTotal: 0 },
        activation: { podlistDate: null, rows: [] },
    });
    const req = buildSyncRequest(ev);
    assert.ok(req);
    assert.equal(req.meteringPoints.length, 2);
    assert.equal(req.meteringPoints[0].meter, 'AT0030000000000000000000000000002');
    assert.equal(new Date(req.meteringPoints[0].from).toISOString().slice(0, 10) <= '2026-07-01', true);
    assert.equal(req.meteringPoints[0].to > req.meteringPoints[0].from, true);
    assert.equal(req.from, req.meteringPoints[0].from);
    assert.equal(req.to, req.meteringPoints[1].to);
    assert.equal(buildSyncRequest(evaluate({ period: quarterPeriod(2026, 3), points: [point()], totals: { produced: 1, consumed: 1, allocated: 1, selfCovered: 1, surplus: 0, daysComplete: 0, daysTotal: 0 }, activation: { podlistDate: null, rows: [] } })), null);
});
