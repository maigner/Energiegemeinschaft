#!/usr/bin/env python3
"""Erzeugt die drei Whiteboard-Grafiken zum Speichermanagement (SVG + PNG).

Aufruf aus dem Repo:  python3 docs/grafiken/speichermanagement/build.py
Die PNGs entstehen mit dem Playwright-Chromium aus ~/.cache/ms-playwright
(oder dem Browser in $CHROME); ohne Browser werden nur die SVGs geschrieben.
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile
from html import escape

OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1600, 900

# Marker-Farben
K = "#23262b"   # schwarz
B = "#1f5fb4"   # blau: Daten
R = "#c8302b"   # rot: Steuerbefehl
G = "#2f8a3c"   # gruen: Batterie / Strom
O = "#e08a1e"   # orange: Sonne / PV
GR = "#8a9097"  # grau: Nebensaechliches
BG = "#fcfcfa"

FONT = "Kalam, 'Comic Relief', 'Segoe Print', 'Bradley Hand', cursive"
TITLE_FONT = "Caveat, Kalam, 'Segoe Print', cursive"
FONTS_CSS = ("https://fonts.googleapis.com/css2?family=Caveat:wght@500;700"
             "&family=Kalam:wght@400;700&display=swap")


def stroke(color, w=4, dash=None):
    s = (f'stroke="{color}" stroke-width="{w}" fill="none" stroke-linecap="round" '
         f'stroke-linejoin="round" stroke-opacity="0.92"')
    if dash:
        s += f' stroke-dasharray="{dash}"'
    return s


def rect(x, y, w, h, color=K, sw=4, fill="none", rx=8):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" {stroke(color, sw)} fill="{fill}"/>'


def path(d, color=K, w=4, dash=None, fill="none"):
    return f'<path d="{d}" {stroke(color, w, dash)} fill="{fill}"/>'


def arrow(x1, y1, x2, y2, color=K, w=3.5, head=16):
    dx, dy = x2 - x1, y2 - y1
    L = (dx * dx + dy * dy) ** 0.5
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    bx, by = x2 - head * ux, y2 - head * uy
    s = 0.55 * head
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2 - 3 * ux:.1f}" y2="{y2 - 3 * uy:.1f}" {stroke(color, w)}/>'
            f'<polyline points="{bx + s * nx:.1f},{by + s * ny:.1f} {x2},{y2} {bx - s * nx:.1f},{by - s * ny:.1f}" '
            f'{stroke(color, w)}/>')


def text(x, y, s, size=22, color=K, anchor="middle", weight=400, font=None, opacity=1):
    f = f' font-family="{font}"' if font else ""
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" '
            f'font-weight="{weight}"{f} fill-opacity="{opacity}">{escape(s)}</text>')


def title(x, y, s, size=56):
    return text(x, y, s, size, K, "start", 700, TITLE_FONT)


def check(x, y, color=G):
    return f'<polyline points="{x},{y + 8} {x + 11},{y + 20} {x + 30},{y - 6}" {stroke(color, 5)}/>'


def battery(x, y, w=100, h=85, cells=2, color=K, fill=G):
    out = [rect(x, y, w, h, color, 4, rx=6),
           rect(x + w * 0.35, y - 8, w * 0.3, 8, color, 3, rx=2)]
    cell_h = (h - 20) / 3
    for i in range(cells):
        cy = y + h - 8 - (i + 1) * cell_h + 2
        out.append(f'<rect x="{x + 9}" y="{cy:.0f}" width="{w - 18}" height="{cell_h - 5:.0f}" '
                   f'fill="{fill}" fill-opacity="0.75" rx="3"/>')
    return "".join(out)


def sun(cx, cy, r=22, color=O):
    import math
    out = [f'<circle cx="{cx}" cy="{cy}" r="{r}" {stroke(color, 4)}/>']
    for i in range(8):
        a = i * math.pi / 4
        out.append(f'<line x1="{cx + (r + 9) * math.cos(a):.1f}" y1="{cy + (r + 9) * math.sin(a):.1f}" '
                   f'x2="{cx + (r + 20) * math.cos(a):.1f}" y2="{cy + (r + 20) * math.sin(a):.1f}" {stroke(color, 4)}/>')
    return "".join(out)


def board(shapes, texts, label):
    """Whiteboard-Rahmen, Wackel-Filter auf den Strichen, Text ohne Filter."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{escape(label)}" font-family="{FONT}">
<defs>
<filter id="wob" x="-3%" y="-3%" width="106%" height="106%">
<feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<radialGradient id="smudge"><stop offset="0" stop-color="#6b7280" stop-opacity="0.07"/><stop offset="1" stop-color="#6b7280" stop-opacity="0"/></radialGradient>
</defs>
<rect width="{W}" height="{H}" fill="{BG}"/>
<ellipse cx="1180" cy="240" rx="420" ry="150" fill="url(#smudge)"/>
<ellipse cx="420" cy="760" rx="380" ry="120" fill="url(#smudge)"/>
<rect x="9" y="9" width="{W - 18}" height="{H - 18}" rx="14" fill="none" stroke="#c3c7cc" stroke-width="12"/>
<rect x="17" y="17" width="{W - 34}" height="{H - 34}" rx="8" fill="none" stroke="#e4e6e9" stroke-width="2"/>
<g filter="url(#wob)">
{"".join(shapes)}
</g>
{"".join(texts)}
</svg>
'''


# ---------------------------------------------------------------- Grafik 1
def grafik_aufbau():
    s, t = [], []
    t.append(title(80, 92, "Wie das Speichermanagement aufgebaut ist"))

    # weitere Anlagen (Geisterhaeuser) hinter dem Haupthaus
    for dx in (36, 18):
        s.append(path(f"M{90+dx},{300-dx} L{360+dx},{170-dx} L{630+dx},{300-dx}", GR, 3))
        s.append(rect(120 + dx, 300 - dx, 480, 400, GR, 3))
    # Haus
    s.append(f'<polygon points="90,300 360,170 630,300" fill="{BG}" {stroke(K, 4)}/>')
    s.append(rect(120, 300, 480, 400, K, 4, fill=BG))
    # PV-Modul auf dem Dach
    s.append(f'<g transform="translate(150,275) rotate(-25.7)">'
             f'{rect(0, -46, 150, 46, K, 3.5, rx=3)}'
             f'<line x1="50" y1="-46" x2="50" y2="0" {stroke(K, 2.5)}/>'
             f'<line x1="100" y1="-46" x2="100" y2="0" {stroke(K, 2.5)}/>'
             f'<text x="75" y="-14" font-size="22" font-weight="700" fill="{K}" text-anchor="middle">PV</text></g>')
    t.append(text(360, 352, "Haushalt eines Mitglieds", 36, K, "middle", 700, TITLE_FONT))
    # Wechselrichter + Batterie
    s.append(rect(150, 400, 210, 220, K))
    t.append(text(255, 440, "Wechselrichter", 24, K, weight=700))
    t.append(text(255, 470, "+ Batterie", 24, K, weight=700))
    s.append(battery(205, 510))
    # Rechner
    s.append(rect(420, 520, 150, 100, R))
    t.append(text(495, 556, "Rechner", 24, R, weight=700))
    t.append(text(495, 583, "(Raspberry Pi,", 19, R))
    t.append(text(495, 606, "ca. 150 €)", 19, R))
    s.append(arrow(420, 570, 360, 570, R))
    t.append(text(360, 664, "steuert Laden und Entladen", 22, R))
    t.append(text(360, 745, "… und jede weitere Anlage, gleich aufgebaut", 22, GR))

    # Datenleitungen Rechner <-> Server, durch das Internet
    s.append(arrow(1120, 560, 570, 560, B))
    s.append(arrow(570, 600, 1120, 600, B))
    cloud = ("M740,622 A45,45 0 0 1 790,545 A50,50 0 0 1 880,530 "
             "A42,42 0 0 1 945,580 A30,30 0 0 1 940,622 Z")
    s.append(path(cloud, K, 4, fill=BG))
    t.append(text(842, 590, "Internet", 24, K))
    t.append(text(842, 614, "(verschlüsselt)", 17, GR))
    t.append(text(842, 500, "holt sich Prognose und Wetter", 22, B))
    t.append(text(842, 674, "meldet den Zustand der Anlage, jede Minute", 22, B))

    # Server
    s.append(rect(1120, 480, 420, 220, K, fill=BG))
    t.append(text(1330, 532, "ischlstrom.org", 44, K, "middle", 700, TITLE_FONT))
    t.append(text(1330, 562, "Server der Gemeinschaft", 19, GR))
    t.append(text(1330, 616, "Prognose je Viertelstunde:", 22, K, weight=700))
    t.append(text(1330, 648, "Wie viel braucht die Gemeinschaft?", 22, K))
    # Eingaben
    s.append(rect(1120, 250, 190, 120, B))
    t.append(text(1215, 290, "Energiedaten", 22, B, weight=700))
    t.append(text(1215, 317, "aller Mitglieder", 22, B))
    t.append(text(1215, 343, "(täglich, aus dem", 17, GR))
    t.append(text(1215, 363, "Abrechnungssystem)", 17, GR))
    s.append(rect(1350, 250, 190, 120, B))
    t.append(text(1445, 318, "Wettervorhersage", 22, B, weight=700))
    s.append(arrow(1215, 370, 1215, 480, B))
    s.append(arrow(1445, 370, 1445, 480, B))
    # Ausgaben
    s.append(arrow(1215, 700, 1215, 770, B))
    s.append(arrow(1445, 700, 1445, 770, B))
    t.append(text(1215, 806, "Vorstand:", 22, K, weight=700))
    t.append(text(1215, 834, "Dashboard und Alarme", 22, K))
    t.append(text(1445, 806, "Mitglieder:", 22, K, weight=700))
    t.append(text(1445, 834, "Monatsbericht und App", 22, K))
    return board(s, t, "Aufbau: Im Haushalt steuert ein kleiner Rechner den Wechselrichter mit Batterie; "
                       "er holt Prognose und Wetter vom Server ischlstrom.org und meldet den Zustand zurueck. "
                       "Der Server rechnet aus Energiedaten aller Mitglieder und Wettervorhersage die Prognose "
                       "und informiert Vorstand und Mitglieder.")


# ---------------------------------------------------------------- Grafik 2
def grafik_tag():
    s, t = [], []
    t.append(title(80, 92, "Ein Tag mit Speichermanagement"))

    def X(h):
        return 140 + h * 55.8333

    # Nacht
    for x0, x1 in ((140, X(6)), (X(19), 1480)):
        s.append(f'<rect x="{x0:.0f}" y="160" width="{x1 - x0:.0f}" height="590" fill="#e9ebee"/>')
    t.append(text(307, 185, "Nacht", 22, GR))
    t.append(text(1340, 185, "Nacht", 22, GR))

    # Spur 1: Gemeinschaft
    t.append(text(140, 140, "Die Gemeinschaft: Erzeugung und Verbrauch", 24, K, "start", 700))
    s.append(path("M140,420 L1480,420", GR, 2, "6 8"))
    s.append(sun(810, 130))
    s.append(path("M475,420 C600,420 700,180 810,180 C920,180 1020,420 1200,420", O, 4))
    s.append(path("M140,358 C300,358 400,345 475,345 C600,345 700,368 810,368 "
                  "C900,368 1040,350 1100,325 C1150,305 1210,305 1260,330 C1310,355 1400,360 1480,360", K, 4))
    t.append(text(810, 290, "Überschuss", 24, O, weight=700))
    t.append(text(810, 318, "versorgt die Nachbarn", 22, O))
    t.append(text(307, 322, "Bedarf", 22, K, weight=700))
    t.append(text(1355, 290, "Bedarf der Gemeinschaft", 22, K, weight=700))

    # Spur 2: Batterie
    t.append(text(140, 500, "Eine Batterie im Haushalt: Füllstand", 24, K, "start", 700))
    s.append(path("M140,540 L1480,540", GR, 2, "6 8"))
    t.append(text(126, 546, "voll", 18, GR, "end"))
    t.append(text(126, 746, "leer", 18, GR, "end"))
    s.append(path("M140,670 L475,670 L670,540 L1089,540 L1424,670 L1480,670", GR, 3.5, "14 10"))
    s.append(path("M140,650 L419,700 L587,700 L1117,540 L1229,540 L1480,650", G, 4.5))
    t.append(text(330, 727, "Reserve fürs Haus bleibt", 21, G))
    t.append(text(880, 722, "lädt gedrosselt, nur aus eigener PV", 21, G))
    t.append(text(1140, 520, "voll zum Sonnenuntergang", 21, G))
    t.append(text(1360, 698, "speist in die Gemeinschaft,", 21, G))
    t.append(text(1360, 724, "solange sie Strom braucht", 21, G))
    # Batterie deckt den Nachtbedarf
    s.append(arrow(1330, 576, 1330, 368, G, 4))
    t.append(text(1150, 470, "Batterien decken den Nachtbedarf", 22, G, weight=700))

    # Achse
    s.append(path("M140,740 L1480,740", K, 3))
    for h, lab in ((0, "0 Uhr"), (6, "6"), (12, "12"), (18, "18"), (24, "24 Uhr")):
        s.append(f'<line x1="{X(h):.0f}" y1="740" x2="{X(h):.0f}" y2="752" {stroke(K, 3)}/>')
        t.append(text(round(X(h)), 782, lab, 22, K))

    # Legende
    items = ((O, None, "PV-Erzeugung"), (K, None, "Verbrauch"),
             (G, None, "Batterie mit Speichermanagement"), (GR, "14 10", "Batterie ohne Steuerung (bisher)"))
    x = 140
    for color, dash, lab in items:
        s.append(path(f"M{x},834 L{x + 50},834", color, 4, dash))
        t.append(text(x + 62, 841, lab, 21, K, "start"))
        x += 62 + len(lab) * 10.6 + 44
    return board(s, t, "Tagesablauf: Tagsueber laedt die Batterie gedrosselt aus der eigenen PV, der Ueberschuss "
                       "der Gemeinschaft versorgt die Nachbarn; zum Sonnenuntergang ist sie voll und speist nachts "
                       "in die Gemeinschaft, solange diese Strom braucht; eine Reserve fuer das Haus bleibt.")


# ---------------------------------------------------------------- Grafik 3
def grafik_regelkreis():
    s, t = [], []
    t.append(title(80, 92, "Wer entscheidet? Und was passiert bei einem Ausfall?", 52))

    t.append(text(250, 170, "Energiedaten aller Mitglieder", 22, B))
    t.append(text(250, 198, "+ Wettervorhersage", 22, B))
    s.append(arrow(250, 215, 250, 300, B))

    s.append(rect(100, 300, 300, 220, K))
    t.append(text(250, 352, "ischlstrom.org", 40, K, "middle", 700, TITLE_FONT))
    t.append(text(250, 402, "rechnet die Prognose", 22, K))
    t.append(text(250, 432, "der Gemeinschaft,", 22, K))
    t.append(text(250, 462, "je Viertelstunde", 22, K))

    s.append(rect(650, 300, 300, 220, R, 4.5))
    t.append(text(800, 352, "Rechner", 40, K, "middle", 700, TITLE_FONT))
    t.append(text(800, 380, "im Haushalt", 19, GR))
    t.append(text(800, 426, "entscheidet lokal:", 22, R, weight=700))
    t.append(text(800, 456, "wann laden, wie schnell,", 22, K))
    t.append(text(800, 486, "wann einspeisen", 22, K))

    s.append(rect(1200, 300, 300, 220, K))
    t.append(text(1350, 352, "Wechselrichter", 40, K, "middle", 700, TITLE_FONT))
    t.append(text(1350, 380, "+ Batterie", 19, GR))
    t.append(text(1350, 440, "führt den Befehl aus", 22, K))
    t.append(text(1350, 490, "Fronius, Sigenergy, Victron, …", 18, GR))

    s.append(arrow(400, 370, 650, 370, B))
    t.append(text(525, 352, "Prognose und Wetter", 21, B))
    s.append(arrow(950, 370, 1200, 370, R))
    t.append(text(1075, 352, "Befehl, gilt 5 Minuten", 21, R))
    s.append(arrow(1200, 450, 950, 450, B))
    t.append(text(1075, 482, "Messwerte", 21, B))
    s.append(arrow(650, 450, 400, 450, B))
    t.append(text(525, 482, "Zustand, jede Minute", 21, B))

    t.append(text(100, 612, "Das Sicherheitsnetz", 40, K, "start", 700, TITLE_FONT))
    s.append(path("M100,624 L410,627", K, 3))
    notes = (
        (100, 672, "Jeder Befehl gilt nur 5 Minuten. Kommt kein neuer,",
         "kehrt die Anlage von selbst zum Werksverhalten zurück."),
        (830, 672, "Kein Internet oder keine Prognose?",
         "Dann läuft die Batterie wie ohne Steuerung weiter."),
        (100, 772, "Der Hauptschalter bleibt beim Mitglied,",
         "der eigene Haushalt hat immer Vorrang."),
        (830, 772, "Geladen wird nur aus der eigenen PV-Anlage,",
         "nie aus dem Netz."),
    )
    for x, y, l1, l2 in notes:
        s.append(check(x, y - 12))
        t.append(text(x + 48, y, l1, 22, K, "start"))
        t.append(text(x + 48, y + 28, l2, 22, K, "start"))
    t.append(text(1500, 866, "Open Source (EUPL-1.2), für andere Gemeinschaften übernehmbar", 19, GR, "end"))
    return board(s, t, "Regelkreis: Der Server rechnet die Prognose der Gemeinschaft, der Rechner im Haushalt "
                       "entscheidet lokal und gibt dem Wechselrichter Befehle, die nur 5 Minuten gelten; "
                       "Messwerte und Zustand fliessen zurueck. Sicherheitsnetz: Werksverhalten ohne Befehl, "
                       "Betrieb wie ohne Steuerung ohne Internet, Hauptschalter beim Mitglied, Laden nur aus eigener PV.")


GRAFIKEN = (
    ("01-aufbau", grafik_aufbau),
    ("02-tagesablauf", grafik_tag),
    ("03-regelkreis", grafik_regelkreis),
)


def standalone(svg):
    style = f"<style>@import url('{FONTS_CSS}');</style>"
    return svg.replace(">", ">\n" + style, 1)


def find_chrome():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    for pat in ("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell",
                "~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome"):
        hits = sorted(glob.glob(os.path.expanduser(pat)))
        if hits:
            return hits[-1]
    for name in ("chromium", "chromium-browser", "google-chrome"):
        if shutil.which(name):
            return shutil.which(name)
    return None


def main():
    chrome = find_chrome()
    for name, fn in GRAFIKEN:
        svg = fn()
        with open(os.path.join(OUT, name + ".svg"), "w") as f:
            f.write(standalone(svg))
        if not chrome:
            continue
        with tempfile.TemporaryDirectory() as tmp:
            page = os.path.join(tmp, "p.html")
            with open(page, "w") as f:
                f.write(f'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="{FONTS_CSS}">'
                        f'<style>html,body{{margin:0;background:{BG}}}svg{{display:block;width:3200px;height:1800px}}</style>'
                        + svg)
            out = os.path.join(OUT, name + ".png")
            subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-sandbox",
                            "--window-size=3200,1800", "--force-device-scale-factor=1",
                            "--virtual-time-budget=10000", f"--screenshot={out}", "file://" + page],
                           check=True, capture_output=True)
            print("PNG", out)
    if not chrome:
        print("Kein Chromium gefunden, nur SVGs geschrieben", file=sys.stderr)


if __name__ == "__main__":
    main()
