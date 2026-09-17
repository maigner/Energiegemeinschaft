// @ts-nocheck
// HTML-Mail und Textfassung des monatlichen Energieberichts. Rendert das
// Inhaltsmodell aus energyReportContent.js (dort stehen Texte und Zahlen;
// das PDF in energyReportPdf.js rendert dasselbe Modell). Mail-taugliches
// HTML: Tabellenlayout, Inline-Styles, keine externen Bilder, kein
// JavaScript, damit Outlook, Gmail und Apple Mail dasselbe zeigen.
import { buildReportContent, COLORS, SITE } from './energyReportContent.js';

const { ink: INK, inkSecondary: INK_SECONDARY, rule: RULE, page: PAGE, surface: SURFACE } = COLORS;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Hoehe der Balkenflaeche; wird je Diagramm auf ein Vielfaches der
// Skalenschritte gerundet
const CHART_HEIGHT = 120;
// halbe Zeilenhoehe der Achsenbeschriftung: um so viel sitzt die
// Balkenflaeche tiefer, damit jede Zahl mittig auf ihrer Hilfslinie steht
const AXIS_LABEL_HALF = 6;

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// **fett** aus dem Inhaltsmodell
const rich = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const plain = (text) => text.replace(/\*\*(.+?)\*\*/g, '$1');

// ---------------------------------------------------------------- Bausteine

const dot = (color) =>
    `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${color};margin-right:5px;"></span>`;

const heading = (text) =>
    `<h2 style="margin:28px 0 10px;font-size:17px;line-height:24px;font-weight:700;color:${INK};">${escapeHtml(text)}</h2>`;

const paragraph = (html, style = '') =>
    `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:${INK};${style}">${html}</p>`;

const note = (html) =>
    `<p style="margin:8px 0 0;font-size:12px;line-height:17px;color:${INK_SECONDARY};">${html}</p>`;

function tilesBlock(block) {
    const cells = block.tiles.map((t) => `
    <td valign="top" style="padding:12px;border:1px solid ${RULE};border-radius:8px;background:${SURFACE};">
        <div style="font-size:12px;line-height:16px;color:${INK_SECONDARY};">${escapeHtml(t.label)}</div>
        <div style="font-size:20px;line-height:28px;font-weight:700;color:${INK};white-space:nowrap;">${escapeHtml(t.value)}</div>
        ${t.detail ? `<div style="font-size:13px;line-height:18px;color:${INK_SECONDARY};">${t.color ? dot(t.color) : ''}${escapeHtml(t.detail)}</div>` : ''}
    </td>`);
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin-bottom:4px;">
        <tr>${cells.map((c, i) => (i ? `<td width="8" style="font-size:0;">&nbsp;</td>${c}` : c)).join('')}</tr>
    </table>`;
}

/**
 * Tagesbalken als Tabelle mit y-Achse: links die Skalenwerte, rechts die
 * Balken (unten Gemeinschaft, darueber der Rest, dazwischen 2px Flaeche).
 * Die Hilfslinien sind ein Hintergrundverlauf; Outlook zeigt den nicht, dort
 * bleiben Achsenwerte und Grundlinie.
 */
function chartBlock(block) {
    const { scale, bars } = block;
    const band = Math.round(CHART_HEIGHT / scale.ticks.length);
    const height = band * scale.ticks.length;
    const px = (kwh) => Math.round((kwh / scale.top) * height);
    const empty = 'font-size:0;line-height:0;';

    const columns = bars.map((b) => {
        const lowerPx = px(b.lower);
        const upperPx = Math.max(0, px(b.lower + b.upper) - lowerPx);
        const upper = upperPx > 0
            ? `<div style="height:${upperPx}px;background:${block.upperColor};border-radius:3px 3px 0 0;${empty}">&nbsp;</div>` : '';
        const gap = upperPx > 0 && lowerPx > 0 ? `<div style="height:2px;${empty}">&nbsp;</div>` : '';
        const lower = lowerPx > 0
            ? `<div style="height:${lowerPx}px;background:${block.lowerColor};${upperPx > 0 ? '' : 'border-radius:3px 3px 0 0;'}${empty}">&nbsp;</div>` : '';
        return `<td valign="bottom" title="${escapeHtml(b.title)}" style="padding:0 2px;height:${height}px;">${upper}${gap}${lower}</td>`;
    }).join('');

    const dayLabels = bars.map((b) => {
        const show = b.day === 1 || b.day % 5 === 0;
        return `<td align="center" style="padding-top:3px;font-size:10px;line-height:12px;color:${INK_SECONDARY};">${show ? b.day : '&nbsp;'}</td>`;
    }).join('');

    const axisCell = `font-size:10px;line-height:${AXIS_LABEL_HALF * 2}px;color:${INK_SECONDARY};padding-right:6px;white-space:nowrap;`;
    const axis = scale.ticks.map((t) =>
        `<tr><td align="right" valign="top" height="${band}" style="height:${band}px;${axisCell}">${t.label}</td></tr>`).join('')
        + `<tr><td align="right" valign="top" style="${axisCell}">0</td></tr>`;

    const gridlines = `background-image:repeating-linear-gradient(to bottom, ${RULE} 0, ${RULE} 1px, transparent 1px, transparent ${band}px);`;

    return `
    <div style="margin:14px 0 0;font-size:12px;line-height:16px;color:${INK_SECONDARY};">
        ${block.legend.map((l) => `${dot(l.color)}${escapeHtml(l.label)}`).join(' &nbsp;&nbsp; ')}
        <span style="float:right;">${escapeHtml(block.unit)}</span>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
    <tr>
        <td valign="top" width="1">
            <table role="presentation" cellpadding="0" cellspacing="0">${axis}</table>
        </td>
        <td valign="top" style="padding-top:${AXIS_LABEL_HALF}px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;${gridlines}background-repeat:no-repeat;background-size:100% ${height}px;">
                <tr>${columns}</tr>
                <tr><td colspan="${bars.length}" style="height:1px;background:#9ca3af;${empty}">&nbsp;</td></tr>
                <tr>${dayLabels}</tr>
            </table>
        </td>
    </tr>
    </table>
    ${note(escapeHtml(block.caption))}`;
}

function rowsBlock(block) {
    const cell = `padding:9px 0;border-bottom:1px solid ${RULE};font-size:14px;line-height:20px;`;
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${block.rows.map(([label, detail, value]) => `
        <tr>
            <td style="${cell}color:${INK};">${escapeHtml(label)}<br><span style="font-size:12px;color:${INK_SECONDARY};">${escapeHtml(detail)}</span></td>
            <td align="right" valign="top" style="${cell}color:${INK};font-weight:700;white-space:nowrap;">${escapeHtml(value)}</td>
        </tr>`).join('')}
    </table>`;
}

const BLOCKS = {
    paragraph: (b) => paragraph(rich(b.text)),
    note: (b) => note(rich(b.text)),
    tiles: tilesBlock,
    chart: chartBlock,
    rows: rowsBlock,
};

// ---------------------------------------------------------------- Ausgabe

/**
 * @param {NonNullable<Awaited<ReturnType<typeof import('./energyReportData.js').buildMemberReport>>>} data
 * @param {{ pdfAttached?: boolean }} [options]  Hinweis auf den PDF-Anhang in die Mail setzen
 * @returns {{ subject: string, html: string, text: string, pdfFilename: string }}
 */
export function renderEnergyReport(data, { pdfAttached = false } = {}) {
    const content = buildReportContent(data);
    const pdfHint = pdfAttached ? 'Den Bericht finden Sie auch als PDF im Anhang.' : '';

    const sections = content.sections.map((s) =>
        heading(s.heading) + s.blocks.map((b) => BLOCKS[b.type](b)).join('')).join('');

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:${PAGE};">${escapeHtml(plain(content.headline))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${SURFACE};border-radius:10px;font-family:${FONT};">
    <tr><td style="padding:22px 28px;background:${INK};border-radius:10px 10px 0 0;border-bottom:4px solid ${COLORS.community};">
        <div style="font-size:12px;line-height:16px;letter-spacing:1.5px;color:#d1d5db;">${escapeHtml(content.brand)}</div>
        <div style="font-size:23px;line-height:30px;font-weight:700;color:#ffffff;">${escapeHtml(content.title)}</div>
    </td></tr>
    <tr><td style="padding:24px 28px 28px;">
        ${paragraph(escapeHtml(content.greeting))}
        ${paragraph(rich(content.headline))}
        ${sections}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
            <tr><td style="background:${INK};border-radius:6px;">
                <a href="${content.portalUrl}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(content.portalLabel)}</a>
            </td></tr>
        </table>
        ${pdfHint ? note(pdfHint) : ''}
        ${paragraph(content.closing.map(escapeHtml).join('<br>'), 'margin-top:20px;')}
    </td></tr>
    <tr><td style="padding:18px 28px 24px;border-top:1px solid ${RULE};">
        ${content.footer.map((line) => note(escapeHtml(line))).join('')}
        ${note(`<a href="${SITE}/datenschutz" style="color:${INK_SECONDARY};">Datenschutz</a> · <a href="${SITE}" style="color:${INK_SECONDARY};">ischlstrom.org</a>`)}
    </td></tr>
    </table>
</td></tr>
</table>
</body>
</html>`;

    return {
        subject: content.subject,
        html,
        text: renderText(content, pdfHint),
        pdfFilename: content.pdfFilename,
    };
}

const TEXT_BLOCKS = {
    paragraph: (b) => [plain(b.text)],
    note: (b) => [plain(b.text)],
    tiles: (b) => b.tiles.map((t) => `${t.label}: ${t.value}${t.detail ? ` (${t.detail})` : ''}`),
    chart: (b) => [b.caption],
    rows: (b) => b.rows.map(([label, detail, value]) => `${label} (${detail}): ${value}`),
};

function renderText(content, pdfHint) {
    const lines = [content.title, '', content.greeting, '', plain(content.headline)];
    for (const section of content.sections) {
        lines.push('', section.heading.toUpperCase());
        for (const block of section.blocks) lines.push(...TEXT_BLOCKS[block.type](block));
    }
    lines.push('', `${content.portalLabel}: ${content.portalUrl}`);
    if (pdfHint) lines.push(pdfHint);
    lines.push('', ...content.closing, '', ...content.footer, `Datenschutz: ${SITE}/datenschutz`);
    return lines.join('\n');
}
