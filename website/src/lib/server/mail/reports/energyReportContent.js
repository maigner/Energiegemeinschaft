// @ts-nocheck
// Inhalt des monatlichen Energieberichts als neutrales Modell: Abschnitte aus
// Bloecken (Absatz, Kacheln, Diagramm, Hinweis, Betragszeilen). HTML-Mail,
// Textfassung (energyReportTemplate.js) und PDF (energyReportPdf.js) rendern
// alle dasselbe Modell, damit Zahlen und Formulierungen nie auseinanderlaufen.
// Neue Inhalte also hier ergaenzen, nicht in einem der Renderer.
//
// Fett in Texten: **so** (die Renderer setzen es um bzw. entfernen es).
//
// Farben wie im Mitgliederbereich (PerformanceChart.svelte): Gruen ist immer
// die Gemeinschaft, Orange das oeffentliche Netz, Blau die Batterie. Zahlen
// und Beschriftungen bleiben in Textfarbe, die Farbe traegt nur die Marke.

export const COLORS = {
    community: '#1baf7a',
    grid: '#eb6834',
    battery: '#2a78d6',
    ink: '#1f2937',
    inkSecondary: '#6b7280',
    rule: '#e5e7eb',
    page: '#f3f4f6',
    surface: '#ffffff',
};

export const SITE = 'https://ischlstrom.org';

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember'];

const monthName = (month) => MONTHS[Number(month.split('-')[1]) - 1];
const monthLabel = (month) => `${monthName(month)} ${month.split('-')[0]}`;

export const num = (value, digits = 0) => value.toLocaleString('de-AT', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
});
// unter 100 kWh mit einer Nachkommastelle, sonst wirken kleine Anlagen gerundet leer
const kwh = (value) => `${num(value, value < 100 ? 1 : 0)} kWh`;
const eur = (value) => `${num(value, 2)} €`;
const ct = (value) => `${num(value, Number.isInteger(value) ? 0 : 1)} ct`;
const share = (part, total) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '');

const change = (current, previous) => {
    if (!(previous > 0)) return null;
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct > 0 ? '+' : ''}${pct}%`;
};

/**
 * Runde y-Skala fuer ein Tagesdiagramm: hoechstens vier Schritte aus der
 * Reihe 1, 2, 5, 10. ticks von oben nach unten ohne die Null.
 * @returns {{ top: number, ticks: { value: number, label: string }[] }}
 */
export function niceScale(max) {
    const rough = max / 4;
    const pow = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough - 1e-12);
    const count = Math.max(1, Math.ceil(max / step - 1e-9));
    const digits = step >= 1 ? 0 : Math.ceil(-Math.log10(step));
    const ticks = [];
    for (let i = count; i >= 1; i--) ticks.push({ value: step * i, label: num(step * i, digits) });
    return { top: step * count, ticks };
}

// ---------------------------------------------------------------- Bausteine

const paragraph = (text) => ({ type: 'paragraph', text });
const note = (text) => ({ type: 'note', text });
const tiles = (items) => ({ type: 'tiles', tiles: items });
const tile = (label, value, detail = '', color = null) => ({ label, value, detail, color });

/**
 * Tagesdiagramm. days: [{ day, total, community }]; gestapelt zeigt es unten
 * den Gemeinschaftsanteil und darueber den Rest (restLabel), mit
 * single = { label, color } eine einzelne Reihe.
 */
function chart(month, days, restLabel, single = null) {
    const max = Math.max(...days.map((d) => d.total));
    if (!(max > 0)) return null;
    const monthNumber = Number(month.split('-')[1]);
    const best = days.reduce((a, b) => (b.total > a.total ? b : a));
    return {
        type: 'chart',
        unit: 'kWh je Tag',
        scale: niceScale(max),
        legend: single ? [single] : [
            { label: 'Gemeinschaft', color: COLORS.community },
            { label: restLabel, color: COLORS.grid },
        ],
        bars: days.map((d) => ({
            day: d.day,
            // unten: Gemeinschaft, oben: Rest (bei single nur "oben")
            lower: single ? 0 : Math.min(d.community, d.total),
            upper: single ? d.total : Math.max(0, d.total - d.community),
            title: single ? `${d.day}.${monthNumber}.: ${kwh(d.total)}`
                : `${d.day}.${monthNumber}.: ${kwh(d.total)}, davon Gemeinschaft ${kwh(d.community)}`,
        })),
        lowerColor: COLORS.community,
        upperColor: single ? single.color : COLORS.grid,
        caption: single ? `Höchster Tag: ${best.day}.${monthNumber}. mit ${kwh(best.total)}.`
            : `Höchster Tag: ${best.day}.${monthNumber}. mit ${kwh(best.total)}, davon ${kwh(best.community)} über die Gemeinschaft.`,
    };
}

const comparison = (label, side, month) => {
    const parts = [];
    const add = (name, previous) => {
        const delta = previous ? change(side.total, previous.total) : null;
        if (delta) parts.push(`${name}: ${kwh(previous.total)} (${delta})`);
    };
    add('Vormonat', side.previousMonth);
    add(`${monthName(month)} im Vorjahr`, side.previousYear);
    return parts.length ? note(`${label} im Vergleich: ${parts.join(' · ')}`) : null;
};

// ---------------------------------------------------------------- Abschnitte

function headline(data) {
    const { consumption, production, month } = data;
    const parts = [];
    if (consumption) {
        parts.push(`**${share(consumption.community, consumption.total)}** Ihres Stroms aus der Gemeinschaft bezogen`);
    }
    if (production) {
        parts.push(`**${share(production.community, production.total)}** Ihrer Einspeisung an andere Mitglieder geliefert`);
    }
    return `Im ${monthName(month)} haben Sie ${parts.join(' und ')}.`;
}

// Mitglieder mit eigener Anlage: der Zaehlpunkt misst nur den Netzbezug, der
// Verbrauch wirkt deshalb oft ueberraschend klein
const OWN_PLANT_NOTE = 'Gezählt wird der Strom, der über Ihren Netzzählpunkt fließt. '
    + 'Was Sie direkt aus Ihrer eigenen Anlage oder Batterie verbrauchen, scheint hier nicht auf.';

function consumptionSection(data) {
    const c = data.consumption;
    if (!c) return null;
    return {
        heading: 'Ihr Verbrauch',
        blocks: [
            tiles([
                tile('Verbrauch gesamt', kwh(c.total)),
                tile('Davon aus der Gemeinschaft', kwh(c.community), `${share(c.community, c.total)} des Verbrauchs`, COLORS.community),
                tile('Vom Stromlieferanten', kwh(c.total - c.community), `${share(c.total - c.community, c.total)} des Verbrauchs`, COLORS.grid),
            ]),
            chart(data.month, c.daily, 'Stromlieferant'),
            data.production ? note(OWN_PLANT_NOTE) : null,
            comparison('Verbrauch', c, data.month),
        ],
    };
}

function productionSection(data) {
    const p = data.production;
    if (!p) return null;
    return {
        heading: 'Ihre Einspeisung',
        blocks: [
            tiles([
                tile('Eingespeist gesamt', kwh(p.total)),
                tile('An die Gemeinschaft geliefert', kwh(p.community), `${share(p.community, p.total)} der Einspeisung`, COLORS.community),
                tile('An Ihren Abnehmer', kwh(p.total - p.community), `${share(p.total - p.community, p.total)} der Einspeisung`, COLORS.grid),
            ]),
            chart(data.month, p.daily, 'Abnehmer (Überschuss)'),
            comparison('Einspeisung', p, data.month),
        ],
    };
}

// Tage unter diesem Wert zaehlen nicht als Einspeisetag (Zaehlerrauschen)
const BATTERY_DAY_MIN_KWH = 0.5;

function batterySection(data) {
    const b = data.battery;
    if (!b) return null;
    const monthNumber = Number(data.month.split('-')[1]);
    const activeDays = b.days.filter((d) => d.kwh >= BATTERY_DAY_MIN_KWH).length;
    const dark = b.byDaylight?.dark;
    const daylight = b.byDaylight?.daylight;
    const darkShare = dark?.feedIn > 0 ? share(dark.community, dark.feedIn) : '';
    const daylightShare = daylight?.feedIn > 0 ? share(daylight.community, daylight.feedIn) : '';

    const cells = [
        tile('Aus der Batterie eingespeist', kwh(b.total),
            data.production ? `${share(Math.min(b.total, data.production.total), data.production.total)} Ihrer Einspeisung` : '',
            COLORS.battery),
        tile('Tage mit Batterie-Einspeisung', num(activeDays),
            activeDays ? `Ø ${kwh(b.total / activeDays)} je Tag` : ''),
    ];
    if (darkShare) {
        cells.push(tile('Abnahme bei Dunkelheit', darkShare,
            daylightShare ? `tagsüber ${daylightShare}` : '', COLORS.community));
    }

    return {
        heading: 'Ihr Speichermanagement',
        blocks: [
            paragraph('Ihre Batterie gibt abends und in der Nacht Sonnenstrom an die Gemeinschaft ab, '
                + 'wenn keine PV-Anlage mehr liefert.'),
            tiles(cells),
            chart(data.month, b.days.map((d) => ({ day: d.day, total: d.kwh, community: 0 })), '',
                { label: 'Einspeisung aus der Batterie', color: COLORS.battery }),
            darkShare ? note('Abnahme bei Dunkelheit: So viel Ihrer Einspeisung in den Stunden ohne Sonne hat die '
                + `Gemeinschaft laut Smart Meter abgenommen${daylightShare ? ', zum Vergleich der Wert bei Tageslicht' : ''}.`) : null,
            b.countedFromDay ? note(`Der Batteriezähler Ihrer Anlage läuft seit ${b.countedFromDay}.${monthNumber}. `
                + 'Frühere Einspeisung aus der Batterie ist hier nicht enthalten.') : null,
            b.fleet?.plants > 1 ? note(`Alle ${b.fleet.plants} Anlagen im Speichermanagement haben im ${monthName(data.month)} `
                + `zusammen ${kwh(b.fleet.total)} aus Batterien eingespeist.`) : null,
        ],
    };
}

function moneySection(data) {
    const { money, consumption, production } = data;
    const rows = [];
    if (money.purchaseEur != null) {
        rows.push(['Gemeinschaftsstrom bezogen', `${kwh(consumption.community)} zu ${ct(money.purchaseCt)}`, eur(money.purchaseEur)]);
    }
    if (money.gridSavingEur != null) {
        rows.push(['Ersparte Netzkosten', `${money.rebatePct}% Rabatt auf das Netznutzungsentgelt`, eur(money.gridSavingEur)]);
    }
    if (money.feedInEur != null) {
        rows.push(['Vergütung für gelieferten Strom', `${kwh(production.community)} zu ${ct(money.feedInCt)}`, eur(money.feedInEur)]);
    }
    if (!rows.length) return null;
    return {
        heading: 'Was das in Euro bedeutet',
        blocks: [
            { type: 'rows', rows },
            note('Richtwerte netto nach dem aktuellen ISCHLSTROM-Tarif. Maßgeblich ist Ihre Abrechnung.'),
        ],
    };
}

function communitySection(data) {
    const c = data.community;
    const w = c.surplusWindow;
    const hint = w && c.surplus > 0
        ? `Sonnenstrom blieb vor allem zwischen ${w.from} und ${w.to} Uhr übrig, insgesamt ${kwh(c.surplus)}. `
            + 'Wer Waschmaschine, Geschirrspüler oder Warmwasser in diese Zeit legt, nutzt mehr Strom aus der Gemeinschaft.'
        : null;
    return {
        heading: `Die Gemeinschaft im ${monthName(data.month)}`,
        blocks: [
            tiles([
                tile('Verbrauch', kwh(c.consumption), `${num(c.consumptionPoints)} Zählpunkte`),
                tile('Einspeisung', kwh(c.production), `${num(c.productionPoints)} Anlagen`),
                tile('Untereinander geteilt', kwh(c.shared), `${share(c.shared, c.consumption)} des Verbrauchs`, COLORS.community),
            ]),
            hint ? paragraph(hint) : null,
        ],
    };
}

/**
 * @param {NonNullable<Awaited<ReturnType<typeof import('./energyReportData.js').buildMemberReport>>>} data
 */
export function buildReportContent(data) {
    const { member, month } = data;
    const sections = [
        consumptionSection(data),
        productionSection(data),
        batterySection(data),
        moneySection(data),
        communitySection(data),
    ].filter(Boolean).map((s) => ({ ...s, blocks: s.blocks.filter(Boolean) }));

    return {
        subject: `Ihr Energiebericht ${monthLabel(month)}`,
        brand: 'EEG ISCHLSTROM',
        title: `Energiebericht ${monthLabel(month)}`,
        pdfFilename: `Energiebericht-${month}.pdf`,
        greeting: `Hallo ${member.name},`,
        headline: headline(data),
        sections,
        portalUrl: `${SITE}/user/${member.identifier}`,
        portalLabel: 'Tagesverlauf im Mitgliederbereich ansehen',
        closing: ['Beste Grüße,', 'der Vorstand der EEG ISCHLSTROM'],
        footer: [
            `Sie erhalten diesen Bericht als Mitglied Nr. ${member.identifier} der Erneuerbaren Energiegemeinschaft ISCHLSTROM. `
                + 'Die Zahlen stammen aus den Viertelstundenwerten Ihres Smart Meters, die der Netzbetreiber an die Gemeinschaft liefert. '
                + 'Die Netz Oberösterreich liefert manche Werte erst mit großer Verzögerung, deshalb können die Daten eines Monats '
                + 'noch unvollständig sein. In seltenen Fällen ändern sich Werte auch nachträglich.',
            'Sie möchten den Bericht nicht mehr bekommen? Eine kurze Antwort auf diese E-Mail genügt.',
        ],
    };
}
