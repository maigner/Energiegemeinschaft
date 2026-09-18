// Speicherrechner (/user/[memberId]/speicherrechner): simuliert einen
// Batteriespeicher auf den 15-Minuten-Werten des Netzzaehlers und schlaegt
// eine Groesse vor. Reine Rechenlogik ohne SvelteKit-Importe, laeuft im
// Browser (Regler reagieren sofort) und mit node.
//
// Datenbasis ist der Netzanschlusspunkt: Netzbezug (Meter Code 193), davon
// aus der Gemeinschaft (195), Netzeinspeisung (196), davon nicht von der
// Gemeinschaft abgenommen (197). Der direkt verbrauchte PV-Strom ist darin
// nicht sichtbar und fuer den Speicher auch egal: laden kann er nur, was
// sonst eingespeist wuerde, ersetzen nur, was sonst bezogen wuerde. Ein
// schon vorhandener Speicher steckt in den Messwerten; der Rechner zeigt
// dann den Nutzen ZUSAETZLICHER Kapazitaet.
//
// Drei Betriebsarten bauen aufeinander auf, damit sich der Nutzen zerlegen
// laesst:
//   A  Eigenverbrauch: Ueberschuss laden, Bezug decken.
//   B  A + Spitzenkappung: ein Teil der Kapazitaet bleibt als Reserve fuer
//      Viertelstunden ueber der Zielleistung stehen und wird bei Bedarf
//      unterhalb der Zielleistung aus dem Netz nachgeladen (Leistungspreis
//      der Netzentgelte ab 2027: hoechste Viertelstunde je Monat).
//   C  B + Entladen in die Gemeinschaft: was der eigene Haushalt bis zum
//      naechsten Laden nicht braucht, geht im Dunkeln ins Netz, begrenzt
//      durch den ungedeckten Bedarf der Gemeinschaft in dieser
//      Viertelstunde (so arbeitet das Speichermanagement, Nacht-
//      Entladebudget in Batteriemanagement/openhab/control/core.js).

const DT_H = 0.25;

// ab dieser Einspeisung je Viertelstunde (kWh) gilt "die PV liefert": dann
// wird nicht in die Gemeinschaft entladen
const EXPORT_THRESHOLD_KWH = 0.02;

// Aufschlag auf den vorausgeschauten Eigenbedarf der Nacht: die echte
// Steuerung kennt die Hauslast nur als Schaetzung und haelt mehr zurueck
const NIGHT_NEED_SAFETY = 1.15;

export const CANDIDATE_SIZES_KWH = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30];
const PEAK_RESERVE_SHARES = [0, 0.1, 0.2, 0.3, 0.5];

/**
 * @typedef {Object} Series
 * @property {number} days              Anzahl der Tage in der Reihe
 * @property {ArrayLike<number>} imp             Netzbezug je Viertelstunde, kWh
 * @property {ArrayLike<number>} impEeg          davon aus der Gemeinschaft, kWh
 * @property {ArrayLike<number>} exp             Netzeinspeisung, kWh
 * @property {ArrayLike<number>} expRest         davon nicht von der Gemeinschaft abgenommen, kWh
 * @property {ArrayLike<number>} uncovered       ungedeckter Bedarf der Gemeinschaft, kWh
 * @property {{ label: string, from: number }[]} months  Monatsgrenzen (Index des ersten Werts)
 */

/**
 * @typedef {Object} Prices
 * @property {number} gridCt        Bezug vom Lieferanten, alles inklusive, ct/kWh
 * @property {number} eegCt         Bezug aus der Gemeinschaft, alles inklusive, ct/kWh
 * @property {number} feedInEegCt   Einspeisung an die Gemeinschaft, ct/kWh
 * @property {number} feedInRestCt  Einspeisung an den Abnehmer (Rest), ct/kWh
 * @property {number} powerEurPerKwYear       Leistungspreis bis zur Schwelle
 * @property {number} powerEurPerKwYearAbove  Leistungspreis ueber der Schwelle
 * @property {number} powerThresholdKw
 * @property {number} powerMinKw
 */

/**
 * @typedef {Object} Battery
 * @property {number} capacityKwh     nutzbare Kapazitaet
 * @property {number} powerKw         Lade- und Entladeleistung
 * @property {number} roundTripEff    0..1
 */

/**
 * @typedef {Object} Mode
 * @property {boolean} peak           Spitzenkappung und Leistungspreis
 * @property {number} peakLimitKw     Zielleistung
 * @property {number} reserveShare    Anteil der Kapazitaet als Spitzenreserve
 * @property {boolean} eeg            in die Gemeinschaft entladen
 */

/**
 * Energie (kWh, ab Batterie), die zu Beginn der Viertelstunde t im Speicher
 * stehen muss, damit der eigene Bezug von da an gedeckt bleibt - kuenftige
 * Ueberschuesse gegengerechnet. Das haelt der Speicher zurueck, bevor er
 * in die Gemeinschaft entlaedt. Im Sommer ist das der Bedarf der Nacht, in
 * trueben Wochen waechst es ueber jede Kapazitaet, dann wird nichts
 * abgegeben.
 * @param {Series} s
 * @param {number} roundTripEff
 */
export function needAhead(s, roundTripEff) {
    const n = s.imp.length;
    const need = new Float64Array(n + 1);
    for (let t = n - 1; t >= 0; t--) {
        need[t] = Math.max(0, s.imp[t] - s.exp[t] * roundTripEff + need[t + 1]);
    }
    return need;
}

/**
 * Leistungspreis eines Monats in Euro fuer die hoechste Viertelstunde.
 * @param {number} peakKw
 * @param {Prices} p
 */
export function powerCostEur(peakKw, p) {
    const billed = Math.max(peakKw, p.powerMinKw);
    const low = Math.min(billed, p.powerThresholdKw);
    const high = Math.max(0, billed - p.powerThresholdKw);
    return (low * p.powerEurPerKwYear + high * p.powerEurPerKwYearAbove) / 12;
}

/**
 * Ein Durchlauf ueber die Reihe. capacityKwh = 0 liefert den Ist-Zustand.
 *
 * @param {Series} s
 * @param {Battery} b
 * @param {Mode} mode
 * @param {Prices} p
 * @param {Float64Array} need  aus needAhead()
 */
export function simulate(s, b, mode, p, need) {
    const n = s.imp.length;
    const cap = b.capacityKwh;
    const eMax = b.powerKw * DT_H;
    const eta = Math.sqrt(b.roundTripEff);
    const floor = mode.peak ? cap * mode.reserveShare : 0;
    const limitKwh = mode.peakLimitKw * DT_H;

    let soc = floor;
    let importKwh = 0, exportKwh = 0, eegFeedKwh = 0, dischargedKwh = 0, gridChargeKwh = 0;
    let importEur = 0, exportEur = 0;

    /** @type {number[]} */
    const monthPeaksKw = [];
    let month = 0;
    let peak = 0;

    for (let t = 0; t < n; t++) {
        if (month + 1 < s.months.length && t === s.months[month + 1].from) {
            monthPeaksKw.push(peak / DT_H);
            peak = 0;
            month++;
        }

        const imp0 = s.imp[t];
        const exp0 = s.exp[t];
        let imp = imp0;
        let exp = exp0;
        let budget = eMax; // Energiedurchsatz der Batterie in dieser Viertelstunde
        let feed = 0;

        if (cap > 0) {
            // Ueberschuss laden
            const charge = Math.min(exp, budget, (cap - soc) / eta);
            if (charge > 0) {
                soc += charge * eta;
                exp -= charge;
                budget -= charge;
            }

            // eigenen Bezug decken, bis zur Spitzenreserve
            const own = Math.min(imp, budget, Math.max(0, soc - floor) * eta);
            if (own > 0) {
                soc -= own / eta;
                imp -= own;
                budget -= own;
                dischargedKwh += own;
            }

            if (mode.peak) {
                if (imp > limitKwh) {
                    // Spitze aus der Reserve kappen
                    const shave = Math.min(imp - limitKwh, budget, soc * eta);
                    if (shave > 0) {
                        soc -= shave / eta;
                        imp -= shave;
                        budget -= shave;
                        dischargedKwh += shave;
                    }
                } else if (soc < floor) {
                    // Reserve unterhalb der Zielleistung aus dem Netz nachladen
                    const refill = Math.min((floor - soc) / eta, limitKwh - imp, budget);
                    if (refill > 0) {
                        soc += refill * eta;
                        imp += refill;
                        budget -= refill;
                        gridChargeKwh += refill;
                    }
                }
            }

            // Rest in die Gemeinschaft, solange die eigene PV nichts liefert
            if (mode.eeg && exp0 <= EXPORT_THRESHOLD_KWH && s.uncovered[t] > 0) {
                const spare = (soc - floor) * eta - need[t + 1] * NIGHT_NEED_SAFETY;
                feed = Math.min(spare, budget, s.uncovered[t]);
                if (feed > 0) {
                    soc -= feed / eta;
                    dischargedKwh += feed;
                } else {
                    feed = 0;
                }
            }
        }

        // Geld: der Gemeinschaftsanteil der Viertelstunde bleibt, wie er war
        const eegShareImp = imp0 > 0 ? Math.min(1, s.impEeg[t] / imp0) : 0;
        importEur += (imp * (eegShareImp * p.eegCt + (1 - eegShareImp) * p.gridCt)) / 100;
        const eegShareExp = exp0 > 0 ? Math.min(1, Math.max(0, (exp0 - s.expRest[t]) / exp0)) : 0;
        exportEur += (exp * (eegShareExp * p.feedInEegCt + (1 - eegShareExp) * p.feedInRestCt)
            + feed * p.feedInEegCt) / 100;

        importKwh += imp;
        exportKwh += exp + feed;
        eegFeedKwh += feed;
        if (imp > peak) peak = imp;
    }
    monthPeaksKw.push(peak / DT_H);

    const powerEur = mode.peak
        ? monthPeaksKw.reduce((sum, kw) => sum + powerCostEur(kw, p), 0)
        : 0;

    return {
        importKwh, exportKwh, eegFeedKwh, dischargedKwh, gridChargeKwh,
        importEur, exportEur, powerEur,
        costEur: importEur - exportEur + powerEur,
        monthPeaksKw,
    };
}

/**
 * @typedef {Object} Options
 * @property {boolean} eeg
 * @property {boolean} peak
 * @property {number} peakLimitKw
 * @property {number} powerPerKwh      Leistung je kWh Kapazitaet (C-Rate)
 * @property {number} maxPowerKw
 * @property {number} roundTripEff
 * @property {number} costFixEur
 * @property {number} costPerKwhEur
 * @property {number} lifetimeYears
 */

/**
 * Alle Groessen durchrechnen und eine empfehlen: die mit dem groessten
 * Ueberschuss aus Nutzen ueber die Lebensdauer minus Anschaffung. Rechnet
 * sich keine, die mit der kuerzesten Amortisation (pays = false).
 *
 * @param {Series} s
 * @param {Prices} p
 * @param {Options} o
 */
export function evaluate(s, p, o) {
    const need = needAhead(s, o.roundTripEff);
    const perYear = 365 / s.days;
    const off = { peak: false, peakLimitKw: o.peakLimitKw, reserveShare: 0, eeg: false };
    const none = { capacityKwh: 0, powerKw: 0, roundTripEff: o.roundTripEff };

    const baseline = simulate(s, none, { ...off, peak: o.peak }, p, need);
    const baselineNoPower = o.peak ? simulate(s, none, off, p, need) : baseline;

    const sizes = CANDIDATE_SIZES_KWH.map((capacityKwh) => {
        const battery = {
            capacityKwh,
            powerKw: Math.min(o.maxPowerKw, capacityKwh * o.powerPerKwh),
            roundTripEff: o.roundTripEff,
        };

        // A: nur Eigenverbrauch, nach heutigem Tarif bewertet
        const selfUse = simulate(s, battery, off, p, need);
        const selfUseEur = (baselineNoPower.costEur - selfUse.costEur) * perYear;

        // B: mit Spitzenkappung, beste Reserve
        let best = selfUse;
        let bestCost = baseline.costEur - selfUseEur / perYear;
        let reserveShare = 0;
        let peakEur = 0;
        if (o.peak) {
            bestCost = Infinity;
            for (const share of PEAK_RESERVE_SHARES) {
                const run = simulate(s, battery, { ...off, peak: true, reserveShare: share }, p, need);
                if (run.costEur < bestCost) {
                    best = run;
                    bestCost = run.costEur;
                    reserveShare = share;
                }
            }
            peakEur = (baseline.costEur - bestCost) * perYear - selfUseEur;
        }

        // C: zusaetzlich in die Gemeinschaft entladen
        let eegEur = 0;
        if (o.eeg) {
            const run = simulate(s, battery, { ...off, peak: o.peak, reserveShare, eeg: true }, p, need);
            eegEur = (bestCost - run.costEur) * perYear;
            best = run;
        }

        const valueEur = selfUseEur + peakEur + eegEur;
        const costEur = o.costFixEur + o.costPerKwhEur * capacityKwh;
        return {
            capacityKwh,
            powerKw: battery.powerKw,
            reserveShare,
            selfUseEur, peakEur, eegEur, valueEur,
            costEur,
            paybackYears: valueEur > 0 ? costEur / valueEur : Infinity,
            netEur: valueEur * o.lifetimeYears - costEur,
            importKwh: best.importKwh * perYear,
            exportKwh: best.exportKwh * perYear,
            eegFeedKwh: best.eegFeedKwh * perYear,
            gridChargeKwh: best.gridChargeKwh * perYear,
            cycles: (best.dischargedKwh * perYear) / capacityKwh,
            monthPeaksKw: best.monthPeaksKw,
        };
    });

    let recommended = sizes.reduce((a, b) => (b.netEur > a.netEur ? b : a));
    const pays = recommended.netEur > 0;
    if (!pays) {
        recommended = sizes.reduce((a, b) => (b.paybackYears < a.paybackYears ? b : a));
    }

    return {
        baseline: {
            importKwh: baseline.importKwh * perYear,
            exportKwh: baseline.exportKwh * perYear,
            costEur: baseline.costEur * perYear,
            monthPeaksKw: baseline.monthPeaksKw,
        },
        sizes,
        recommendedKwh: recommended.capacityKwh,
        pays,
    };
}
