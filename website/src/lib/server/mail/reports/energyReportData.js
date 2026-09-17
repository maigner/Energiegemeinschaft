// @ts-nocheck
// Stellt die Zahlen fuer den monatlichen Energiebericht eines Mitglieds
// zusammen. Reine Logik ohne $lib/$env-Importe (relative Pfade), damit das
// CLI website/scripts/energy-report.js denselben Code verwendet wie der
// Cron-Job.
import { tariffFor, gridSavingCtForMonth } from '../../../tariffs.js';
import {
    METER, shiftMonth, daysInMonth,
    getMemberMonthlyTotals, getMemberDailyTotals,
    getCommunityMonth, getCommunitySurplusByHour,
    getMemberBatteryMonth, getFleetBatteryMonth, getMemberFeedInByDaylight,
} from '../../db/energy/monthlyReport.js';

/**
 * Zusammenhaengendes Stundenfenster um die staerkste Stunde, in dem der
 * Ueberschuss mindestens halb so hoch war wie in der Spitze.
 * @param {number[]} hours 24 Werte
 * @returns {{ from: number, to: number } | null}  to ist exklusiv (10 bis 15 Uhr)
 */
export function surplusWindow(hours) {
    const peak = Math.max(...hours);
    if (!(peak > 0)) return null;
    const peakHour = hours.indexOf(peak);
    let from = peakHour;
    let to = peakHour;
    while (from > 0 && hours[from - 1] >= peak / 2) from--;
    while (to < 23 && hours[to + 1] >= peak / 2) to++;
    return { from, to: to + 1 };
}

/**
 * Teil des Berichts, der fuer alle Mitglieder gleich ist. Einmal je Lauf
 * laden und an buildMemberReport weiterreichen.
 */
export async function loadCommunityReport(db, month) {
    const community = await getCommunityMonth(db, month);
    const surplusByHour = await getCommunitySurplusByHour(db, month);
    return {
        batteryFleet: await getFleetBatteryMonth(db, month),
        consumption: community.totals[METER.consumption] ?? 0,
        production: community.totals[METER.production] ?? 0,
        shared: community.totals[METER.communityReceived] ?? 0,
        surplus: community.totals[METER.surplus] ?? 0,
        consumptionPoints: community.consumptionPoints,
        productionPoints: community.productionPoints,
        surplusWindow: surplusWindow(surplusByHour),
    };
}

const side = (totals, totalId, partOf) => {
    const total = totals?.[totalId];
    if (!(total > 0)) return null;
    return { total, community: Math.max(0, partOf(totals)) };
};

const consumptionOf = (totals) =>
    side(totals, METER.consumption, (t) => t[METER.communityReceived] ?? 0);

// an die Gemeinschaft geliefert = Einspeisung minus nicht abgenommener Ueberschuss
const productionOf = (totals) =>
    side(totals, METER.production, (t) => t[METER.production] - (t[METER.surplus] ?? 0));

/**
 * @param {{ query: Function }} db
 * @param {{ identifier: number, name: string, email: string }} member
 * @param {string} month 'YYYY-MM'
 * @param {Awaited<ReturnType<typeof loadCommunityReport>>} community
 * @returns null, wenn das Mitglied im Monat keine Messwerte hat
 */
export async function buildMemberReport(db, member, month, community) {
    const prevMonth = shiftMonth(month, -1);
    const prevYear = shiftMonth(month, -12);
    const monthly = await getMemberMonthlyTotals(db, member.identifier, prevYear, month);

    // Vergleichsmonate nur, wenn sie (fast) vollstaendig gemessen sind -
    // ein Beitritt mitten im Monat ergaebe sonst "+1600%"
    for (const m of [prevMonth, prevYear]) {
        if ((monthly[m]?.days ?? 0) < daysInMonth(m) - 2) delete monthly[m];
    }

    const consumption = consumptionOf(monthly[month]);
    const production = productionOf(monthly[month]);
    if (!consumption && !production) return null;

    const daily = await getMemberDailyTotals(db, member.identifier, month);

    // Speichermanagement: nur fuer Mitglieder mit Batteriezaehler im Monat
    const batteryMonth = await getMemberBatteryMonth(db, member.identifier, month);
    const battery = batteryMonth && batteryMonth.total > 0 ? {
        ...batteryMonth,
        byDaylight: production ? await getMemberFeedInByDaylight(db, member.identifier, month) : null,
        fleet: community.batteryFleet,
    } : null;

    const [year, monthNumber] = month.split('-').map(Number);
    const tariff = tariffFor(year);
    const gridSavingCt = gridSavingCtForMonth(year, monthNumber);

    return {
        month,
        member,
        community,
        consumption: consumption && {
            ...consumption,
            previousMonth: consumptionOf(monthly[prevMonth]),
            previousYear: consumptionOf(monthly[prevYear]),
            daily: daily.map((d) => ({
                day: d.day,
                total: d[METER.consumption] ?? 0,
                community: d[METER.communityReceived] ?? 0,
            })),
        },
        production: production && {
            ...production,
            previousMonth: productionOf(monthly[prevMonth]),
            previousYear: productionOf(monthly[prevYear]),
            daily: daily.map((d) => ({
                day: d.day,
                total: d[METER.production] ?? 0,
                community: Math.max(0, (d[METER.production] ?? 0) - (d[METER.surplus] ?? 0)),
            })),
        },
        battery,
        money: {
            purchaseCt: tariff.eeg.purchaseCt,
            feedInCt: tariff.eeg.feedInCt,
            gridSavingCt,
            rebatePct: tariff.rebate.regionalPct,
            purchaseEur: consumption ? (consumption.community * tariff.eeg.purchaseCt) / 100 : null,
            gridSavingEur: consumption && gridSavingCt > 0
                ? (consumption.community * gridSavingCt) / 100 : null,
            feedInEur: production && tariff.eeg.feedInCt != null
                ? (production.community * tariff.eeg.feedInCt) / 100 : null,
        },
    };
}
