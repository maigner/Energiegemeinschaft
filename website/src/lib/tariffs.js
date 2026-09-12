// Zentrale Preis- und Tarifdaten: EEG-Tarife, Netzentgelte Netz OÖ,
// EEG-Rabatte, Abgaben und Vergleichstarife von Lieferanten.
//
// Alle Preise netto ohne USt, in ct/kWh bzw. Euro. Ein Eintrag je
// Kalenderjahr; neue Jahre oben ergaenzen, alte Jahre stehen lassen, weil
// die Jahresuebersicht historische Jahre damit rechnet. Quellen stehen bei
// jedem Block. Importierbar aus Client- und Servercode.

/**
 * @typedef {Object} Competitor
 * @property {string} name
 * @property {number} workCt      Arbeitspreis netto ct/kWh (bei Spot: Aufschlag auf EPEX)
 * @property {number|null} baseEurPerMonth  Grundpreis netto
 * @property {boolean} [spot]
 * @property {string} note
 * @property {string} source
 */

/**
 * @typedef {Object} YearTariff
 * @property {{ purchaseCt: number, feedInCt: number|null, membershipFeeEur: number, note: string }} eeg
 * @property {{ operator: string, level: number, usageCt: number, usageMeteredCt: number,
 *   usageSnapCt: number|null, baseEurPerYear: number, lossCt: number, source: string }} grid
 * @property {{ regionalPct: number, localPct: number, source: string }} rebate
 * @property {{ electricityTaxCt: number, electricityTaxRegularCt: number,
 *   renewableContributionCt: number, renewableContributionEurPerYear: number,
 *   renewableFlatEurPerYear: number, source: string }} levies
 * @property {Competitor[]} competitors
 * @property {string} asOf  Datum der letzten Pruefung dieser Werte
 */

const REBATE = {
    // Nur der Arbeitspreis des Netznutzungsentgelts wird reduziert, das
    // Netzverlustentgelt nicht. Gilt bis Ende 2026; ab 2027 legt die
    // E-Control neue Rabatte nach dem ElWG fest, Oktober bis Dezember 2026
    // wird gar kein Rabatt verrechnet (FAQ energiegemeinschaften.gv.at).
    regionalPct: 28,
    localPct: 57,
    source: "§ 5 Abs. 1a SNE-V 2018 (BGBl. II Nr. 438/2021), Netzebene 6 und 7",
};

/** @type {Record<number, YearTariff>} */
export const TARIFFS = {
    2026: {
        asOf: "2026-09-11",
        eeg: {
            purchaseCt: 10,
            feedInCt: 9.5,
            membershipFeeEur: 0,
            note: "seit 1.1.2026, Beschluss Generalversammlung",
        },
        grid: {
            operator: "Netz Oberösterreich",
            level: 7,
            usageCt: 6.29, // nicht gemessene Leistung
            usageMeteredCt: 4.68,
            usageSnapCt: 5.03, // Sommer-Nieder-Arbeitspreis April bis September 10 bis 16 Uhr, nicht fuer EEG-Mengen
            baseEurPerYear: 54,
            lossCt: 0.528,
            source: "SNE-V 2018 Novelle 2026, BGBl. II Nr. 305/2025",
        },
        rebate: REBATE,
        levies: {
            electricityTaxCt: 0.1, // Haushalte 2026 befristet gesenkt
            electricityTaxRegularCt: 1.5, // Regelsatz ElAbgG, ab 2027 wieder
            renewableContributionCt: 0.62, // Erneuerbaren-Foerderbeitrag NE7 nicht gemessen
            renewableContributionEurPerYear: 3.8,
            renewableFlatEurPerYear: 19.02, // Erneuerbaren-Foerderpauschale NE7
            source: "Erneuerbaren-Förderbeitragsverordnung 2026; ElAbgG-Novelle 2025 (Elektrizitätsabgabe 0,1 ct für 2026)",
        },
        competitors: [
            {
                name: "Energie AG Ökostrom Loyal",
                workCt: 12.42, // 14,90 brutto
                baseEurPerMonth: 3.85, // 4,62 brutto
                note: "Standardtarif Bestandskunden, Preisgarantie 1 Jahr ab 1.4.2025",
                source: "https://stromliste.at/versorger/energie-ag/tarife",
            },
            {
                name: "Energie AG Feel Good Energie für alle",
                workCt: 10.0, // 12,00 brutto, 12 Monate ab Lieferbeginn
                baseEurPerMonth: 4.4, // 5,28 brutto laut Stromliste, Energie AG nennt keinen Wert
                note: "Neukundentarif seit 4.5.2026, Arbeitspreis 12 Monate fix",
                source: "https://ooe.orf.at/stories/3343384/",
            },
            {
                name: "Energie AG Ökostrom Spot",
                workCt: 2.0, // Aufschlag auf EPEX-Spot, 3,00 brutto
                baseEurPerMonth: 4.5, // 5,40 brutto
                spot: true,
                note: "dynamischer Tarif, EPEX-Spot plus Aufschlag",
                source: "https://stromliste.at/versorger/energie-ag/tarife",
            },
        ],
    },
    2025: {
        asOf: "2026-09-11",
        eeg: {
            purchaseCt: 11,
            feedInCt: 11,
            membershipFeeEur: 20,
            note: "Einspeisung und Bezug je 11 ct/kWh",
        },
        grid: {
            operator: "Netz Oberösterreich",
            level: 7,
            usageCt: 6.23,
            usageMeteredCt: 4.57,
            usageSnapCt: null,
            baseEurPerYear: 48,
            lossCt: 0.554,
            source: "SNE-V 2018 Novelle 2025, BGBl. II Nr. 370/2024",
        },
        rebate: REBATE,
        levies: {
            electricityTaxCt: 1.5,
            electricityTaxRegularCt: 1.5,
            renewableContributionCt: 0.796, // 0,737 Netznutzung + 0,059 Netzverlust
            renewableContributionEurPerYear: 4.695,
            renewableFlatEurPerYear: 19.02,
            source: "Erneuerbaren-Förderbeitragsverordnung 2025, BGBl. II Nr. 419/2024",
        },
        competitors: [],
    },
    2024: {
        asOf: "2026-09-11",
        eeg: {
            purchaseCt: 11,
            feedInCt: 11,
            membershipFeeEur: 20,
            note: "Einspeisung und Bezug je 11 ct/kWh",
        },
        grid: {
            operator: "Netz Oberösterreich",
            level: 7,
            usageCt: 4.66,
            usageMeteredCt: 3.4,
            usageSnapCt: null,
            baseEurPerYear: 36,
            lossCt: 0.796,
            source: "SNE-V 2018 Novelle 2024, BGBl. II Nr. 395/2023",
        },
        rebate: REBATE,
        levies: {
            electricityTaxCt: 0.1, // Strompreisbremse, bis Ende 2024
            electricityTaxRegularCt: 1.5,
            renewableContributionCt: 0, // 2022 bis 2024 ausgesetzt
            renewableContributionEurPerYear: 0,
            renewableFlatEurPerYear: 0,
            source: "Elektrizitätsabgabe 0,1 ct bis 31.12.2024; Erneuerbaren-Förderbeitrag 2024 ausgesetzt",
        },
        competitors: [],
    },
};

export const CURRENT_YEAR = 2026;

/** Tarife des aktuellen Jahres. */
export const CURRENT = TARIFFS[CURRENT_YEAR];

/**
 * Tarife fuer ein Jahr; fehlt das Jahr, gilt das naechstaeltere, davor das
 * aelteste bekannte.
 * @param {number|string} year
 * @returns {YearTariff}
 */
export function tariffFor(year) {
    const y = Number(year);
    const known = Object.keys(TARIFFS)
        .map(Number)
        .sort((a, b) => a - b);
    let pick = known[0];
    for (const k of known) if (k <= y) pick = k;
    return TARIFFS[pick];
}

/**
 * Netzkosten-Ersparnis je kWh aus der EEG in ct (nur Netznutzungs-Arbeitspreis).
 * @param {YearTariff} t
 * @param {"regional"|"local"} [kind]
 */
export function gridSavingCt(t, kind = "regional") {
    const pct = kind === "local" ? t.rebate.localPct : t.rebate.regionalPct;
    return (t.grid.usageCt * pct) / 100;
}

/**
 * Preisvorteil des EEG-Bezugs gegenueber dem ersten Vergleichstarif in ct/kWh.
 * @param {YearTariff} t
 */
export function priceAdvantageCt(t) {
    const ref = t.competitors.find((c) => !c.spot);
    return ref ? ref.workCt - t.eeg.purchaseCt : 0;
}

/**
 * Deutsche Zahl mit bis zu zwei Nachkommastellen, etwa "9,5" oder "10".
 * @param {number|null|undefined} v
 */
export const fmtCt = (v) =>
    v == null ? "–" : v.toLocaleString("de-AT", { maximumFractionDigits: 2 });
