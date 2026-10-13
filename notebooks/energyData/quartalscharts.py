"""Quartalscharts für die Generalversammlung: Verbrauch, Erzeugung und
Verteilung der Erzeugung je Quartal, Berichtsjahr gegen Vorjahr.

Liest `daily_metering_quality` (Tagessummen je Meter-Code samt Anzahl der
Zählpunkte) über den pg-Service `eeg-middleware` und schreibt PNGs plus eine
Sammel-PDF nach `generalversammlung/`.

    ../../.venv/bin/python quartalscharts.py                # 2025 gegen 2024
    ../../.venv/bin/python quartalscharts.py --year 2026    # 2026 gegen 2025
    ../../.venv/bin/python quartalscharts.py --out /pfad    # anderes Zielverzeichnis

Meter-Codes: 193 Gesamtverbrauch der Mitglieder, 195 Eigendeckung (aus der
Gemeinschaft bezogen), 196 gesamte gemeinschaftliche Erzeugung, 197
Überschuss (Erzeugung, die niemand in der Gemeinschaft abgenommen hat).
196 ≈ 195 + 197. Code 194 ist praktisch identisch mit 196 und wird ignoriert.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import psycopg
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib.transforms import blended_transform_factory

matplotlib.use("Agg")

METER_CONSUMPTION = 193
METER_SELF_COVERAGE = 195
METER_GENERATION = 196
METER_SURPLUS = 197

# Farben: Markengrün von ischlstrom.org (primary-600) als Akzent, Blau als
# zweite Serie (Paar grün/blau validiert mit dem dataviz-Validator, Grün/Orange
# fällt bei Rot-Grün-Schwäche zusammen), Grau als Vorjahr.
GREEN = "#418a26"
BLUE = "#2a78d6"
GRAY = "#a3a19b"
INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
BASELINE = "#c3c2b7"
SURFACE = "#ffffff"

QUARTERS = [1, 2, 3, 4]
LEFT = 0.1  # linker Rand von Titel, Legende und Achse (Figurkoordinaten)

plt.rcParams.update(
    {
        "font.family": ["Noto Sans", "DejaVu Sans"],
        "font.size": 11,
        "axes.edgecolor": BASELINE,
        "axes.labelcolor": INK_2,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "text.color": INK,
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "savefig.facecolor": SURFACE,
    }
)


@dataclass
class Quarter:
    year: int
    quarter: int
    consumption: float = 0.0  # kWh
    self_coverage: float = 0.0
    generation: float = 0.0
    surplus: float = 0.0
    consumption_points: int = 0  # Zählpunkte am Quartalsende
    generation_points: int = 0
    days: int = 0

    @property
    def used_share(self) -> float:
        """Anteil der Erzeugung, der in der Gemeinschaft verbraucht wurde."""
        return self.self_coverage / self.generation if self.generation else 0.0

    @property
    def coverage(self) -> float:
        """Anteil des Verbrauchs, den die Gemeinschaft gedeckt hat."""
        return self.self_coverage / self.consumption if self.consumption else 0.0


def load(years: list[int]) -> dict[tuple[int, int], Quarter]:
    data = {(y, q): Quarter(y, q) for y in years for q in QUARTERS}
    with psycopg.connect("service=eeg-middleware") as conn:
        cur = conn.cursor()
        cur.execute(
            """
            select extract(year from day)::int, extract(quarter from day)::int,
                   meter_code_id, sum(sum_in_kwh), count(*)
            from daily_metering_quality
            where extract(year from day) = any(%s)
            group by 1, 2, 3
            """,
            (years,),
        )
        for y, q, code, kwh, days in cur.fetchall():
            item = data[(y, q)]
            kwh = float(kwh)
            if code == METER_CONSUMPTION:
                item.consumption = kwh
                item.days = days
            elif code == METER_SELF_COVERAGE:
                item.self_coverage = kwh
            elif code == METER_GENERATION:
                item.generation = kwh
            elif code == METER_SURPLUS:
                item.surplus = kwh
        cur.execute(
            """
            with d as (
                select day, meter_code_id, n_points,
                       row_number() over (
                           partition by extract(year from day), extract(quarter from day), meter_code_id
                           order by day desc) rn
                from daily_metering_quality
                where meter_code_id in (%s, %s) and extract(year from day) = any(%s))
            select extract(year from day)::int, extract(quarter from day)::int, meter_code_id, n_points
            from d where rn = 1
            """,
            (METER_CONSUMPTION, METER_GENERATION, years),
        )
        for y, q, code, n in cur.fetchall():
            if code == METER_CONSUMPTION:
                data[(y, q)].consumption_points = n
            else:
                data[(y, q)].generation_points = n
    return data


# --- Formatierung -----------------------------------------------------------


def de_int(value: float) -> str:
    return f"{value:,.0f}".replace(",", ".")


def mwh(kwh: float) -> str:
    v = kwh / 1000
    if v >= 10:
        return f"{de_int(v)} MWh"
    return f"{v:.1f}".replace(".", ",") + " MWh"


def pct(share: float) -> str:
    return f"{round(share * 100):.0f}%"


# --- Zeichenhilfen ----------------------------------------------------------


def _units_per_px(ax):
    bbox = ax.get_window_extent()
    x0, x1 = ax.get_xlim()
    y0, y1 = ax.get_ylim()
    return (x1 - x0) / bbox.width, (y1 - y0) / bbox.height


def bar(ax, x, y0, height, width, color, round_top=True, r_px=5):
    """Säule mit abgerundetem oberem Ende, unten eckig an der Grundlinie."""
    ux, uy = _units_per_px(ax)
    rx, ry = r_px * ux, r_px * uy
    left = x - width / 2
    if not round_top or height <= 2 * ry:
        ax.add_patch(Rectangle((left, y0), width, height, facecolor=color, lw=0))
        return
    ax.add_patch(Rectangle((left, y0), width, height - ry, facecolor=color, lw=0))
    ax.add_patch(
        FancyBboxPatch(
            (left, y0 + height - 2 * ry),
            width,
            2 * ry,
            boxstyle=f"round,pad=0,rounding_size={rx}",
            mutation_aspect=ry / rx,
            facecolor=color,
            lw=0,
        )
    )


def frame(ax, ymax, yfmt, title, subtitle, source):
    ax.set_xlim(-0.6, 3.6)
    ax.set_ylim(0, ymax)
    ax.set_xticks(range(4), [f"Q{q}" for q in QUARTERS])
    ax.tick_params(axis="both", length=0, labelsize=11)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(BASELINE)
    ax.spines["bottom"].set_linewidth(1)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: yfmt(v)))
    fig = ax.figure
    fig.text(LEFT, 0.93, title, fontsize=17, fontweight="bold", color=INK, ha="left", va="top")
    fig.text(LEFT, 0.865, subtitle, fontsize=11.5, color=INK_2, ha="left", va="top")
    fig.text(LEFT, 0.025, source, fontsize=8.5, color=MUTED, ha="left", va="bottom", linespacing=1.4)


def legend(fig, entries, y=0.80):
    x = LEFT
    for color, label in entries:
        fig.patches.append(
            FancyBboxPatch(
                (x, y - 0.012), 0.014, 0.024,
                boxstyle="round,pad=0,rounding_size=0.004", transform=fig.transFigure,
                facecolor=color, lw=0,
            )
        )
        t = fig.text(x + 0.022, y, label, fontsize=10.5, color=INK_2, va="center", ha="left")
        fig.canvas.draw()
        width = t.get_window_extent().transformed(fig.transFigure.inverted()).width
        x += 0.022 + width + 0.03


def new_figure():
    fig = plt.figure(figsize=(11, 6.8), dpi=200)
    ax = fig.add_axes([LEFT, 0.26, 0.94 - LEFT, 0.51])
    return fig, ax


def points_row(ax, label, values, xs):
    """Zeile unter der x-Achse: Anzahl Zählpunkte je Säule."""
    trans = blended_transform_factory(ax.transData, ax.transAxes)
    ax.text(-0.6, -0.15, label, transform=trans, fontsize=9, color=MUTED, ha="left", va="center")
    for x, v in zip(xs, values):
        ax.text(x, -0.22, de_int(v), transform=trans, fontsize=9.5, color=INK_2, ha="center", va="center")


# --- Charts -----------------------------------------------------------------


def grouped(data, years, attr, points_attr, title, subtitle, source, ylabel_fmt, value_fmt):
    """Gruppierte Säulen je Quartal: Vorjahr grau, Berichtsjahr grün."""
    prev, cur = years
    fig, ax = new_figure()
    values = {y: [getattr(data[(y, q)], attr) for q in QUARTERS] for y in years}
    ymax = max(max(v) for v in values.values()) * 1.18
    frame(ax, ymax, ylabel_fmt, title, subtitle, source)
    fig.canvas.draw()
    width, offset = 0.34, 0.19
    xs = {prev: [], cur: []}
    for i, q in enumerate(QUARTERS):
        for y, dx, color in ((prev, -offset, GRAY), (cur, offset, GREEN)):
            v = values[y][i]
            bar(ax, i + dx, 0, v, width, color)
            xs[y].append(i + dx)
            ax.text(
                i + dx, v + ymax * 0.015, value_fmt(v),
                ha="center", va="bottom", fontsize=9.5 if y == prev else 10.5,
                color=MUTED if y == prev else INK, fontweight="normal" if y == prev else "bold",
            )
    legend(fig, [(GRAY, str(prev)), (GREEN, str(cur))])
    pts = [getattr(data[(y, q)], points_attr) for q in QUARTERS for y in years]
    xs_all = [x for i in range(4) for x in (xs[prev][i], xs[cur][i])]
    points_row(ax, "Zählpunkte am Quartalsende", pts, xs_all)
    return fig


def distribution(data, years, source):
    """Je Quartal und Jahr eine 100%-Säule: in der Gemeinschaft genutzt vs. Überschuss."""
    prev, cur = years
    fig, ax = new_figure()
    frame(
        ax, 100, lambda v: f"{v:.0f}%",
        "Wohin floss der Gemeinschaftsstrom?",
        f"Anteil der gemeinschaftlichen Erzeugung, der von Mitgliedern verbraucht wurde, je Quartal {prev} und {cur}",
        source,
    )
    ax.yaxis.grid(False)
    ax.set_ylim(0, 114)
    ax.set_yticks([0, 25, 50, 75, 100])
    fig.canvas.draw()
    _, uy = _units_per_px(ax)
    gap = 2 * uy
    width, offset = 0.34, 0.19
    xs = []
    for i, q in enumerate(QUARTERS):
        for y, dx in ((prev, -offset), (cur, offset)):
            item = data[(y, q)]
            used = item.used_share * 100
            x = i + dx
            xs.append(x)
            if item.generation <= 0:
                continue
            bar(ax, x, 0, used - gap / 2, width, GREEN, round_top=False)
            bar(ax, x, used + gap / 2, 100 - used - gap / 2, width, BLUE)
            ax.text(
                x, used / 2, pct(item.used_share), ha="center", va="center",
                fontsize=10.5, color="white", fontweight="bold",
            )
            ax.text(x, 103, str(y), ha="center", va="bottom", fontsize=9.5, color=MUTED)
    legend(fig, [(GREEN, "von Mitgliedern verbraucht"), (BLUE, "Überschuss, ins öffentliche Netz")])
    pts = [data[(y, q)].generation_points for q in QUARTERS for y in years]
    points_row(ax, "Erzeuger am Quartalsende", pts, xs)
    return fig


def growth(data, years, source):
    """Zählpunkte am Quartalsende über acht Quartale, Verbraucher und Erzeuger."""
    prev, cur = years
    fig = plt.figure(figsize=(11, 6.8), dpi=200)
    ax = fig.add_axes([LEFT, 0.2, 0.94 - LEFT, 0.57])
    keys = [(y, q) for y in years for q in QUARTERS]
    cons = [data[k].consumption_points for k in keys]
    gen = [data[k].generation_points for k in keys]
    ymax = max(cons) * 1.15
    ax.set_xlim(-0.4, len(keys) - 0.3)
    ax.set_ylim(0, ymax)
    ax.set_xticks(range(len(keys)), [f"Q{q}\n{y}" for y, q in keys])
    ax.tick_params(axis="both", length=0, labelsize=10.5)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(BASELINE)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    fig.text(LEFT, 0.93, "Die Gemeinschaft wächst", fontsize=17, fontweight="bold", color=INK, va="top")
    fig.text(
        LEFT, 0.865,
        f"Zählpunkte mit Messdaten am Ende jedes Quartals, {prev} bis {cur}",
        fontsize=11.5, color=INK_2, va="top",
    )
    fig.text(LEFT, 0.025, source, fontsize=8.5, color=MUTED, va="bottom", linespacing=1.4)
    xs = list(range(len(keys)))
    for series, color, label in ((cons, BLUE, "Verbrauchs-Zählpunkte"), (gen, GREEN, "Erzeugungs-Zählpunkte")):
        ax.plot(xs, series, color=color, lw=2, solid_joinstyle="round", solid_capstyle="round", zorder=3)
        ax.scatter(xs, series, s=48, color=color, edgecolor=SURFACE, linewidth=2, zorder=4)
        ax.text(xs[-1] + 0.15, series[-1], f"{series[-1]}  {label}", va="center", ha="left", fontsize=10.5, color=INK)
    ax.set_xlim(-0.6, len(keys) + 2.2)
    legend(fig, [(BLUE, "Verbrauchs-Zählpunkte"), (GREEN, "Erzeugungs-Zählpunkte")])
    return fig


def kpi(data, years, source):
    """Kennzahlenzeile für das Berichtsjahr mit dem Vorjahr als Referenz."""
    prev, cur = years

    def total(y, attr):
        return sum(getattr(data[(y, q)], attr) for q in QUARTERS)

    gen_cur, gen_prev = total(cur, "generation"), total(prev, "generation")
    self_cur, self_prev = total(cur, "self_coverage"), total(prev, "self_coverage")
    cons_cur, cons_prev = total(cur, "consumption"), total(prev, "consumption")
    tiles = [
        ("Stromverbrauch der Mitglieder", mwh(cons_cur), f"{prev}: {mwh(cons_prev)}"),
        ("Erzeugung in der Gemeinschaft", mwh(gen_cur), f"{prev}: {mwh(gen_prev)}"),
        ("davon selbst verbraucht", mwh(self_cur), f"{pct(self_cur / gen_cur)} der Erzeugung, {prev}: {pct(self_prev / gen_prev)}"),
        ("Zählpunkte Ende " + str(cur), de_int(data[(cur, 4)].consumption_points), f"Ende {prev}: {de_int(data[(prev, 4)].consumption_points)}"),
    ]
    fig = plt.figure(figsize=(11, 3.6), dpi=200)
    fig.text(LEFT, 0.9, f"ISCHLSTROM {cur} in Zahlen", fontsize=17, fontweight="bold", color=INK, va="top")
    fig.text(LEFT, 0.04, source, fontsize=8.5, color=MUTED, va="bottom", linespacing=1.4)
    n = len(tiles)
    gap, left, right = 0.02, LEFT, 0.94
    w = (right - left - gap * (n - 1)) / n
    for i, (label, value, note) in enumerate(tiles):
        x = left + i * (w + gap)
        fig.patches.append(
            FancyBboxPatch(
                (x, 0.2), w, 0.5, boxstyle="round,pad=0,rounding_size=0.01",
                transform=fig.transFigure, facecolor="#f4f6f0", lw=0,
            )
        )
        fig.text(x + 0.015, 0.63, label, fontsize=10, color=INK_2, va="center")
        fig.text(x + 0.015, 0.45, value, fontsize=24, fontweight="bold", color=GREEN, va="center")
        fig.text(x + 0.015, 0.28, note, fontsize=9.5, color=MUTED, va="center")
    return fig


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--year", type=int, default=2025, help="Berichtsjahr (Vergleich mit dem Jahr davor)")
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "generalversammlung")
    args = parser.parse_args()
    cur, prev = args.year, args.year - 1
    years = [prev, cur]
    data = load(years)
    args.out.mkdir(parents=True, exist_ok=True)

    source = (
        "Quelle: Viertelstundenwerte von Netz OÖ über EEG-Faktura, Tagessummen aller Zählpunkte der Gemeinschaft.\n"
        "Verbrauch = Gesamtverbrauch der teilnehmenden Zählpunkte, nicht nur der Bezug aus der Gemeinschaft."
    )
    if prev == 2024:
        source += " 2024: Gemeinschaft im Aufbau, Messdaten ab 15.1.2024."

    charts = [
        ("01-kennzahlen", kpi(data, years, source)),
        (
            "02-verbrauch",
            grouped(
                data, years, "consumption", "consumption_points",
                "Stromverbrauch der Mitglieder je Quartal",
                f"Gesamtverbrauch aller teilnehmenden Zählpunkte, {prev} und {cur}",
                source, lambda v: f"{v / 1000:.0f} MWh", mwh,
            ),
        ),
        (
            "03-erzeugung",
            grouped(
                data, years, "generation", "generation_points",
                "Erzeugung in der Gemeinschaft je Quartal",
                f"Einspeisung aller Erzeugungs-Zählpunkte, {prev} und {cur}",
                source, lambda v: f"{v / 1000:.0f} MWh", mwh,
            ),
        ),
        (
            "04-genutzt",
            grouped(
                data, years, "self_coverage", "consumption_points",
                "Gemeinschaftsstrom, der bei Mitgliedern ankam",
                f"Eigendeckung je Quartal: Strom aus der Gemeinschaft, den Mitglieder zeitgleich verbraucht haben, {prev} und {cur}",
                source, lambda v: f"{v / 1000:.0f} MWh", mwh,
            ),
        ),
        ("05-verteilung", distribution(data, years, source)),
        (
            "06-deckungsgrad",
            grouped(
                data, years, "coverage", "consumption_points",
                "Wie viel des Verbrauchs deckte die Gemeinschaft?",
                f"Anteil des Mitglieder-Verbrauchs, der aus der Gemeinschaft kam, je Quartal {prev} und {cur}",
                source, lambda v: f"{v * 100:.0f}%", pct,
            ),
        ),
        ("07-wachstum", growth(data, years, source)),
    ]
    with PdfPages(args.out / f"generalversammlung-{cur}.pdf") as pdf:
        for name, fig in charts:
            fig.savefig(args.out / f"{name}.png", dpi=200)
            pdf.savefig(fig)
            plt.close(fig)

    print(f"{'Quartal':9} {'Verbrauch':>12} {'Erzeugung':>12} {'genutzt':>12} {'Überschuss':>12} {'genutzt%':>9} {'Deckung%':>9} {'ZP V':>5} {'ZP E':>5}")
    for y in years:
        for q in QUARTERS:
            d = data[(y, q)]
            print(
                f"{y} Q{q:<4} {d.consumption:12.0f} {d.generation:12.0f} {d.self_coverage:12.0f} {d.surplus:12.0f}"
                f" {d.used_share * 100:8.1f}% {d.coverage * 100:8.1f}% {d.consumption_points:5d} {d.generation_points:5d}"
            )
    print(f"geschrieben nach {args.out}")


if __name__ == "__main__":
    main()
