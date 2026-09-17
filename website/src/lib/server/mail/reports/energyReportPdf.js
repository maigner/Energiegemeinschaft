// @ts-nocheck
// PDF-Fassung des monatlichen Energieberichts (Mail-Anhang). Rendert dasselbe
// Inhaltsmodell wie die HTML-Mail (energyReportContent.js) mit pdfkit als
// Vektorgrafik - reines JavaScript, kein Browser im Docker-Image noetig.
// Schrift ist das eingebaute Helvetica (WinAnsi): deckt Umlaute, € und Ø ab,
// aber keine schmalen Leerzeichen, daher clean().
import PDFDocument from 'pdfkit';
import { buildReportContent, COLORS, SITE } from './energyReportContent.js';

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BOTTOM = PAGE_HEIGHT - 56; // darunter steht die Fusszeile

const REGULAR = 'Helvetica';
const BOLD = 'Helvetica-Bold';

const CHART_HEIGHT = 90;
const AXIS_WIDTH = 30;

// toLocaleString('de-AT') trennt Tausender mit einem (schmalen) geschuetzten
// Leerzeichen, das Helvetica nicht kennt
const clean = (text) => String(text ?? '').replace(/[\u00a0\u202f\u2009]/g, ' ');

/**
 * @param {NonNullable<Awaited<ReturnType<typeof import('./energyReportData.js').buildMemberReport>>>} data
 * @returns {Promise<Buffer>}
 */
export function renderEnergyReportPdf(data) {
    const content = buildReportContent(data);
    const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true, // Fusszeilen mit Seitenzahl am Ende nachtragen
        info: { Title: content.title, Author: content.brand, Subject: content.subject },
        lang: 'de-AT',
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    let y = 0;

    // neue Seite, wenn der naechste Baustein nicht mehr ganz Platz hat
    const ensure = (height) => {
        if (y + height <= BOTTOM) return;
        doc.addPage();
        y = MARGIN;
    };

    const textHeight = (text, font, size, width = WIDTH, lineGap = 2) =>
        doc.font(font).fontSize(size).heightOfString(clean(text), { width, lineGap });

    // Absatz mit **fetten** Stellen
    const richText = (text, size, color, gapAfter) => {
        const height = textHeight(text.replace(/\*\*/g, ''), REGULAR, size, WIDTH, 3);
        ensure(height);
        const parts = clean(text).split(/\*\*(.+?)\*\*/);
        doc.fontSize(size).fillColor(color);
        // x/y nur beim ersten Stueck: pdfkit setzt fortgesetzten Text sonst neu an
        const pieces = parts.map((part, i) => ({ part, bold: i % 2 === 1 })).filter((p) => p.part);
        pieces.forEach(({ part, bold }, i) => {
            const options = { width: WIDTH, lineGap: 3, continued: i < pieces.length - 1 };
            doc.font(bold ? BOLD : REGULAR);
            if (i === 0) doc.text(part, MARGIN, y, options);
            else doc.text(part, options);
        });
        y += height + gapAfter;
    };

    const noteText = (text) => {
        const height = textHeight(text, REGULAR, 8.5);
        ensure(height);
        doc.font(REGULAR).fontSize(8.5).fillColor(COLORS.inkSecondary)
            .text(clean(text), MARGIN, y, { width: WIDTH, lineGap: 2 });
        y += height + 5;
    };

    const dot = (x, cy, color) => doc.circle(x + 3, cy, 3).fill(color);

    // ------------------------------------------------------------ Bausteine

    const BLOCKS = {
        paragraph: (b) => richText(b.text, 10.5, COLORS.ink, 9),
        note: (b) => noteText(b.text),

        tiles(b) {
            const gap = 8;
            const height = 56;
            const width = (WIDTH - gap * (b.tiles.length - 1)) / b.tiles.length;
            ensure(height + 8);
            b.tiles.forEach((t, i) => {
                const x = MARGIN + i * (width + gap);
                doc.roundedRect(x, y, width, height, 6).lineWidth(0.75).stroke(COLORS.rule);
                doc.font(REGULAR).fontSize(8.5).fillColor(COLORS.inkSecondary)
                    .text(clean(t.label), x + 10, y + 9, { width: width - 20, lineBreak: false });
                doc.font(BOLD).fontSize(15).fillColor(COLORS.ink)
                    .text(clean(t.value), x + 10, y + 22, { width: width - 20, lineBreak: false });
                if (t.detail) {
                    if (t.color) dot(x + 10, y + 46.5, t.color);
                    doc.font(REGULAR).fontSize(9).fillColor(COLORS.inkSecondary)
                        .text(clean(t.detail), x + 10 + (t.color ? 10 : 0), y + 43, { width: width - 30, lineBreak: false });
                }
            });
            y += height + 10;
        },

        chart(b) {
            const legendHeight = 14;
            ensure(legendHeight + CHART_HEIGHT + 40);

            // Legende links, Einheit rechts
            let x = MARGIN;
            doc.font(REGULAR).fontSize(8.5);
            for (const item of b.legend) {
                dot(x, y + 5, item.color);
                doc.fillColor(COLORS.inkSecondary).text(clean(item.label), x + 10, y + 1, { lineBreak: false });
                x += 10 + doc.widthOfString(clean(item.label)) + 14;
            }
            doc.fillColor(COLORS.inkSecondary).text(b.unit, MARGIN, y + 1, { width: WIDTH, align: 'right' });
            y += legendHeight + 4;

            // Achse und Hilfslinien
            const plotX = MARGIN + AXIS_WIDTH;
            const plotWidth = WIDTH - AXIS_WIDTH;
            const baseline = y + CHART_HEIGHT;
            const toY = (kwh) => baseline - (kwh / b.scale.top) * CHART_HEIGHT;
            doc.font(REGULAR).fontSize(7.5);
            for (const tick of [...b.scale.ticks, { value: 0, label: '0' }]) {
                const ty = toY(tick.value);
                doc.moveTo(plotX, ty).lineTo(plotX + plotWidth, ty).lineWidth(tick.value ? 0.5 : 0.75)
                    .stroke(tick.value ? COLORS.rule : '#9ca3af');
                doc.fillColor(COLORS.inkSecondary)
                    .text(clean(tick.label), MARGIN, ty - 3, { width: AXIS_WIDTH - 5, align: 'right', lineBreak: false });
            }

            // Balken: unten Gemeinschaft, darueber der Rest, 1pt Abstand
            const slot = plotWidth / b.bars.length;
            const barWidth = slot * 0.68;
            const segment = (bx, top, bottom, color, rounded) => {
                const h = bottom - top;
                if (h < 0.4) return;
                const r = rounded ? Math.min(2, h, barWidth / 2) : 0;
                doc.moveTo(bx, bottom).lineTo(bx, top + r)
                    .quadraticCurveTo(bx, top, bx + r, top)
                    .lineTo(bx + barWidth - r, top)
                    .quadraticCurveTo(bx + barWidth, top, bx + barWidth, top + r)
                    .lineTo(bx + barWidth, bottom).closePath().fill(color);
            };
            b.bars.forEach((bar, i) => {
                const bx = plotX + i * slot + (slot - barWidth) / 2;
                const lowerTop = toY(bar.lower);
                const upperTop = toY(bar.lower + bar.upper);
                const hasUpper = lowerTop - upperTop >= 0.4;
                segment(bx, lowerTop, baseline, b.lowerColor, !hasUpper);
                segment(bx, upperTop, lowerTop - (bar.lower > 0 ? 1 : 0), b.upperColor, true);
                if (bar.day === 1 || bar.day % 5 === 0) {
                    doc.font(REGULAR).fontSize(7.5).fillColor(COLORS.inkSecondary)
                        .text(String(bar.day), bx - 10, baseline + 4, { width: barWidth + 20, align: 'center', lineBreak: false });
                }
            });
            y = baseline + 18;
            noteText(b.caption);
        },

        rows(b) {
            for (const [label, detail, value] of b.rows) {
                ensure(31);
                doc.font(REGULAR).fontSize(10).fillColor(COLORS.ink).text(clean(label), MARGIN, y + 5, { lineBreak: false });
                doc.font(REGULAR).fontSize(8.5).fillColor(COLORS.inkSecondary).text(clean(detail), MARGIN, y + 18, { lineBreak: false });
                doc.font(BOLD).fontSize(10).fillColor(COLORS.ink).text(clean(value), MARGIN, y + 5, { width: WIDTH, align: 'right' });
                y += 30;
                doc.moveTo(MARGIN, y).lineTo(MARGIN + WIDTH, y).lineWidth(0.5).stroke(COLORS.rule);
            }
            y += 8;
        },
    };

    // ---------------------------------------------------------------- Seite

    // Kopfband ueber die volle Breite
    doc.rect(0, 0, PAGE_WIDTH, 86).fill(COLORS.ink);
    doc.rect(0, 86, PAGE_WIDTH, 3).fill(COLORS.community);
    doc.font(REGULAR).fontSize(8.5).fillColor('#d1d5db').text(content.brand, MARGIN, 28, { characterSpacing: 1.2 });
    doc.font(BOLD).fontSize(19).fillColor('#ffffff').text(clean(content.title), MARGIN, 42);
    y = 112;

    richText(content.greeting, 10.5, COLORS.ink, 6);
    richText(content.headline, 10.5, COLORS.ink, 4);

    for (const section of content.sections) {
        // Ueberschrift (und eine Einleitung) nie allein am Seitenende: mit den
        // ersten beiden Bausteinen gemeinsam umbrechen
        const estimate = { chart: CHART_HEIGHT + 60, tiles: 70, paragraph: 40, note: 20, rows: 40 };
        ensure(30 + section.blocks.slice(0, 2).reduce((sum, b) => sum + estimate[b.type], 0));
        y += 9;
        doc.font(BOLD).fontSize(12.5).fillColor(COLORS.ink).text(clean(section.heading), MARGIN, y);
        y += 21;
        for (const block of section.blocks) BLOCKS[block.type](block);
    }

    // Verweis auf den Mitgliederbereich, Gruss und Herkunft der Zahlen - als
    // Block, damit nie ein einzelner Satz allein auf der letzten Seite steht.
    // Im PDF ohne den Satz zum Abbestellen "per Antwort auf diese E-Mail".
    const source = content.footer[0];
    ensure(6 + 22 + content.closing.length * 15 + 16 + textHeight(source, REGULAR, 8.5));
    y += 6;
    doc.font(REGULAR).fontSize(10).fillColor(COLORS.ink)
        .text(`${content.portalLabel}: `, MARGIN, y, { continued: true })
        .fillColor(COLORS.battery).text(content.portalUrl, { link: content.portalUrl, underline: true });
    y += 22;
    for (const line of content.closing) {
        doc.font(REGULAR).fontSize(10.5).fillColor(COLORS.ink).text(clean(line), MARGIN, y);
        y += 15;
    }
    y += 8;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + WIDTH, y).lineWidth(0.5).stroke(COLORS.rule);
    y += 8;
    noteText(source);

    // Fusszeile auf jeder Seite
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(pages.start + i);
        doc.page.margins.bottom = 0; // sonst legt pdfkit fuer Text unterhalb des Rands eine neue Seite an
        doc.font(REGULAR).fontSize(8).fillColor(COLORS.inkSecondary)
            .text(`${content.brand} · ${SITE.replace('https://', '')}`, MARGIN, PAGE_HEIGHT - 36, { lineBreak: false })
            .text(`Seite ${i + 1} von ${pages.count}`, MARGIN, PAGE_HEIGHT - 36, { width: WIDTH, align: 'right', lineBreak: false });
    }

    doc.end();
    return finished;
}
