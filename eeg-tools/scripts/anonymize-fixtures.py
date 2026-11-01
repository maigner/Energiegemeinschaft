#!/usr/bin/env python3
"""Anonymisierte Test-Fixtures aus den echten EEG-Faktura-Exporten erzeugen.

Die echten Exporte liegen (gitignored) in eegfaktura-datalib/test-files/.
Dieses Skript schreibt anonymisierte Kopien nach eegfaktura-datalib/fixtures/,
gegen die `cargo test -p eegfaktura-datalib` laeuft und die eingecheckt werden
koennen:

- Namen, E-Mail-Adressen, Adressen, Telefonnummern, IBANs, Kontoinhaber und
  Firmennamen werden durch deterministisch erzeugte Werte ersetzt (gleiche
  Eingabe -> gleiche Ausgabe, ein erneuter Lauf aendert die Fixtures nicht).
- Zaehlpunkt-IDs werden in allen Dateien konsistent durch synthetische IDs
  `AT` + 31 Ziffern ersetzt (Praefix AT999, damit sie nie mit echten Netz-OOe-
  Zaehlpunkten kollidieren).
- Datumswerte, Status, Bezugsrichtungen, Tarifnamen, Teilnahmefaktoren,
  Energiewerte, Qualitaetszaehler und Zellkommentare bleiben erhalten, weil
  die Pruefungen davon abhaengen.

Aufruf (aus dem Repo-Root, mit dem Repo-.venv):

    .venv/bin/python -I eeg-tools/scripts/anonymize-fixtures.py            # erzeugen
    .venv/bin/python -I eeg-tools/scripts/anonymize-fixtures.py --verify   # pruefen
    .venv/bin/python -I eeg-tools/scripts/anonymize-fixtures.py --map AT003... 005

`--verify` laedt die Originale und sucht jeden Namen, jede IBAN, jede Adresse
und jede echte Zaehlpunkt-ID in allen Zellen und Kommentaren der Fixtures;
Fundstellen werden gemeldet und der Exit-Code ist dann 1.
`--map` zeigt, worauf eine echte Zaehlpunkt-ID bzw. ein Mitglied (Nummer)
abgebildet wird; das braucht man beim Anpassen der Rust-Tests.
"""

import argparse
import hashlib
import re
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
DATALIB = HERE.parent / "eegfaktura-datalib"
DEFAULT_SRC = DATALIB / "test-files"
DEFAULT_OUT = DATALIB / "fixtures"

# Quelle -> Ziel. Der Energy-Report ohne Luecken bekommt einen Namen nach dem
# Muster `Energy-Report-<start>_<end>.xlsx`, damit der eegfaktura-checker das
# Fixture-Verzeichnis direkt als Eingabeordner nimmt; der Report mit Luecken
# passt absichtlich nicht auf dieses Muster.
FILES = [
    ("EEG-Masterdata.xlsx", "EEG-Masterdata-20260315.xlsx"),
    ("ZP_PODLIST.xlsx", "ZP_PODLIST.xlsx"),
    ("Energy-Report-small.xlsx", "Energy-Report-20251001_20251001.xlsx"),
    ("Energy-Report-small-missing-data.xlsx", "Energy-Report-missing-data.xlsx"),
]

SALT = "eegfaktura-fixtures-2026"
METER_ID_RE = re.compile(r"^AT\d{31}$")
COMMUNITY_ID_RE = re.compile(r"^AT\d{11}RC\d{15}$")
COMMUNITY_ID_FAKE = "AT00300000000RC999999000000000000"

FIRST_NAMES = [
    "Alma", "Bruno", "Cilli", "Dario", "Elke", "Falko", "Gerda", "Hugo",
    "Ilse", "Jonas", "Karla", "Lenz", "Mira", "Nico", "Olga", "Pius",
    "Rosa", "Sepp", "Tilda", "Uwe", "Vera", "Wim", "Xenia", "Yannik", "Zita",
]
LAST_NAMES = [
    "Mustermann", "Beispielbauer", "Fiktivhofer", "Probegruber", "Testleitner",
    "Platzhalter", "Attrappenberger", "Dummyreiter", "Scheinhuber", "Modellwirt",
    "Uebungsmayr", "Stellvertreter", "Phantomsteiner", "Blindtexter",
    "Lorem", "Ipsum", "Vorlagenbauer", "Entwurfner", "Prototypinger",
]
COMPANY_WORDS = ["Muster", "Beispiel", "Test", "Probe", "Modell", "Vorlage", "Platzhalter"]
COMPANY_KINDS = ["Handel", "Technik", "Bau", "Energie", "Service", "Werkstatt", "Praxis"]
COMPANY_FORMS = ["GmbH", "KG", "OG", "e.U.", "Verein"]
STREETS = [
    "Musterweg", "Beispielgasse", "Testallee", "Probestrasse", "Fiktivplatz",
    "Uebungsstrasse", "Attrappenweg", "Platzhaltergasse", "Modellring",
]
FAKE_PLZ = "4000"
FAKE_ORT = "Musterstadt"


def digest(*parts):
    h = hashlib.sha256()
    h.update(SALT.encode())
    for p in parts:
        h.update(b"\0")
        h.update(str(p).encode())
    return int.from_bytes(h.digest()[:12], "big")


def pick(items, *parts):
    return items[digest(*parts) % len(items)]


def fake_meter_id(real_id):
    return "AT999" + "0" * 20 + f"{digest('zp', real_id) % 10**8:08d}"


def fake_consent_id(real):
    return "AT003000" + f"{digest('consent', real) % 10**24:024d}"


def fake_iban(key):
    # Fiktive Bankleitzahl 99999 (keine oesterreichische Bank), gueltige
    # Pruefziffer nach ISO 7064 mod 97-10.
    bban = "99999" + f"{digest('iban', key) % 10**11:011d}"
    check = 98 - int(bban + "292900") % 97  # A=10, T=29, "00" Pruefziffer-Platzhalter
    iban = f"AT{check:02d}{bban}"
    return " ".join(iban[i:i + 4] for i in range(0, len(iban), 4))


def fake_person(member_no):
    return pick(FIRST_NAMES, "first", member_no), pick(LAST_NAMES, "last", member_no)


def fake_company(member_no):
    return " ".join([
        pick(COMPANY_WORDS, "cw", member_no) + pick(COMPANY_KINDS, "ck", member_no).lower(),
        pick(COMPANY_KINDS, "ck2", member_no),
        pick(COMPANY_FORMS, "cf", member_no),
    ])


def fake_street(member_no):
    return pick(STREETS, "street", member_no), str(1 + digest("hausnr", member_no) % 99)


def s(value):
    return value.strip() if isinstance(value, str) else value


def header_index(ws, row=1):
    return {s(c.value): c.column for c in ws[row] if isinstance(c.value, str)}


# ---------------------------------------------------------------------------
# Masterdata
# ---------------------------------------------------------------------------

def anonymize_masterdata(wb):
    """Gibt {zaehlpunkt_id_echt: anzeigename_synthetisch} fuer die Energy-Reports zurueck."""
    ws = wb["Mitglieder"]
    col = header_index(ws)
    owners = {}  # echte ZP-ID -> (rang, synthetischer Name)

    for r in range(2, ws.max_row + 1):
        def get(name):
            return ws.cell(row=r, column=col[name]).value

        def put(name, value, nth=0):
            # einige Ueberschriften (PLZ, Ort, Strasse, HausNr.) kommen zweimal vor
            cols = [c.column for c in ws[1] if s(c.value) == name]
            # nicht ws.cell(value=...): das ueberspringt None
            ws.cell(row=r, column=cols[nth]).value = value

        member_no = s(get("Mit. Nr."))
        if not member_no:
            continue
        business = s(get("teilnahme als")) == "Business"
        if business:
            display = fake_company(member_no)
            put("Name 1", display)
            put("Name 2", None)
        else:
            first, last = fake_person(member_no)
            display = f"{first} {last}"
            put("Name 1", first)
            put("Name 2", last)
        put("Titel", None)
        put("E-Mail", f"mitglied-{member_no}@example.org")
        put("Telefonnummer", None)
        put("SteuerNr.", None)
        put("Ust.", None)
        put("IBAN.", fake_iban(member_no))
        put("Kontoinhaber", display)
        put("Bankname", "Musterbank")
        put("Mandat-Ref.", None)
        street, hausnr = fake_street(member_no)
        for nth in (0, 1):
            put("PLZ", FAKE_PLZ, nth)
            put("Ort", FAKE_ORT, nth)
            put("Straße", street, nth)
            put("HausNr.", hausnr, nth)
        put("ZpNr.", None)
        put("Zählpunktname", None)
        put("WechselrichterNr.", None)

        zp = s(get("Zählpunkt"))
        if zp:
            rank = (s(get("ZP-Status")) == "ACTIVE", get("aktiviert") or "")
            if zp not in owners or rank > owners[zp][0]:
                owners[zp] = (rank, display)
            put("Zählpunkt", fake_meter_id(zp))

    # Das Deckblatt (Sheet mit der Gemeinschafts-ID als Namen): Kontakt- und
    # Bankdaten des Vereins durch Platzhalter ersetzen.
    for sheet in wb.worksheets:
        if sheet.title == "Mitglieder":
            continue
        rows = list(sheet.iter_rows())
        for i, row in enumerate(rows):
            label = s(row[0].value)
            if label == "Kurzname":
                data = rows[i + 1]
                data[0].value, data[1].value = "MUSTERSTROM", "MUSTERSTROM"
                data[2].value = COMMUNITY_ID_FAKE
            elif label == "Kontaktperson":
                data = rows[i + 1]
                for cell, v in zip(data, ["Maxi Musterperson", "info@example.org", "0000 0000000",
                                          FAKE_PLZ, FAKE_ORT, STREETS[0], "1",
                                          "https://example.org"]):
                    cell.value = v
            elif label == "Kontoinhaber":
                data = rows[i + 1]
                data[0].value = "Erneuerbare-Energie-Gemeinschaft MUSTERSTROM"
                data[1].value = fake_iban("verein")
        if sheet.title.startswith("RC"):
            sheet.title = "RC999999"

    return {zp: name for zp, (_, name) in owners.items()}


# ---------------------------------------------------------------------------
# Podlist
# ---------------------------------------------------------------------------

def anonymize_podlist(wb):
    ws = wb["ZP-List"]
    col = header_index(ws)
    for r in range(2, ws.max_row + 1):
        zp = ws.cell(row=r, column=col["Zählpunktname"])
        if isinstance(zp.value, str) and METER_ID_RE.match(zp.value.strip()):
            zp.value = fake_meter_id(zp.value.strip())
        consent = ws.cell(row=r, column=col["ConsentID"])
        if isinstance(consent.value, str) and consent.value.strip():
            consent.value = fake_consent_id(consent.value.strip())


# ---------------------------------------------------------------------------
# Energy report
# ---------------------------------------------------------------------------

def meter_display_name(real_id, owners):
    return owners.get(real_id) or f"Anlage {fake_meter_id(real_id)[-8:]}"


def anonymize_energy_report(wb, owners, real_names):
    # Summary: Kopfzeile "Verbrauchszählpunkt", Spalte "Name" daneben.
    ws = wb["Summary"]
    header_row = next(
        (r for r in range(1, ws.max_row + 1)
         if s(ws.cell(row=r, column=1).value) == "Verbrauchszählpunkt"),
        None,
    )
    if header_row is None:
        sys.exit("Summary: Kopfzeile 'Verbrauchszählpunkt' nicht gefunden")
    name_col = header_index(ws, header_row)["Name"]
    for r in range(header_row + 1, ws.max_row + 1):
        cell = ws.cell(row=r, column=1)
        if isinstance(cell.value, str) and METER_ID_RE.match(cell.value.strip()):
            real_id = cell.value.strip()
            ws.cell(row=r, column=name_col, value=meter_display_name(real_id, owners))

    # Energiedaten: eine Spalte je Zaehlpunkt, die Kopfzeilen 2 (ID) und 3
    # (Name) sind durch die Beschriftung in Spalte A bestimmt, wenn vorhanden.
    ws = wb["Energiedaten"]
    labels = {s(ws.cell(row=r, column=1).value): r for r in range(1, 10)}
    id_row = labels.get("MeteringpointID", 2)
    name_row = labels.get("Name", 3)
    for c in range(2, ws.max_column + 1):
        cell = ws.cell(row=id_row, column=c)
        if isinstance(cell.value, str) and METER_ID_RE.match(cell.value.strip()):
            ws.cell(row=name_row, column=c, value=meter_display_name(cell.value.strip(), owners))

    # Alle Blaetter (auch z. B. "QoV Log" aelterer Exporte): IDs und bekannte
    # Namen in jeder Zelle ersetzen.
    for sheet in wb.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                v = cell.value
                if not isinstance(v, str):
                    continue
                t = v.strip()
                if METER_ID_RE.match(t):
                    cell.value = fake_meter_id(t)
                elif COMMUNITY_ID_RE.match(t):
                    cell.value = COMMUNITY_ID_FAKE
                elif t in real_names:
                    cell.value = real_names[t]


# ---------------------------------------------------------------------------
# Sensible Werte der Originale (fuer --verify und die Namensersetzung)
# ---------------------------------------------------------------------------

def collect_sensitive(src):
    """Gibt (sensible Strings, {echter Name: synthetischer Name}) zurueck."""
    sensitive = set()
    real_names = {}

    def add(v):
        if isinstance(v, str):
            v = v.strip()
            if len(v) >= 4:
                sensitive.add(v)
                sensitive.add(v.replace(" ", ""))

    wb = openpyxl.load_workbook(src / "EEG-Masterdata.xlsx")
    ws = wb["Mitglieder"]
    col = header_index(ws)
    for r in range(2, ws.max_row + 1):
        def get(name):
            return s(ws.cell(row=r, column=col[name]).value)
        member_no = get("Mit. Nr.")
        business = get("teilnahme als") == "Business"
        n1, n2 = get("Name 1"), get("Name 2")
        display = fake_company(member_no) if business else " ".join(fake_person(member_no))
        for v in (n1, n2):
            if v:
                real_names[v] = display
        if n1 and n2:
            real_names[f"{n1} {n2}"] = display
            real_names[f"{n2} {n1}"] = display
        for name in ("Name 2", "E-Mail", "Telefonnummer", "IBAN.", "Kontoinhaber",
                     "Mandat-Ref.", "Straße", "Ort", "Zählpunkt"):
            add(get(name))
        if n1 and n2:
            add(f"{n1} {n2}")
        if business:
            add(n1)
    for sheet in wb.worksheets:
        if sheet.title == "Mitglieder":
            continue
        rows = list(sheet.iter_rows(values_only=True))
        for i, row in enumerate(rows):
            if row[0] in ("Kurzname", "Kontaktperson", "Kontoinhaber"):
                for v in rows[i + 1]:
                    add(v)

    wb = openpyxl.load_workbook(src / "ZP_PODLIST.xlsx")
    ws = wb["ZP-List"]
    col = header_index(ws)
    for r in range(2, ws.max_row + 1):
        add(ws.cell(row=r, column=col["Zählpunktname"]).value)
        add(ws.cell(row=r, column=col["ConsentID"]).value)

    for name, _ in FILES:
        if not name.startswith("Energy-Report"):
            continue
        wb = openpyxl.load_workbook(src / name)
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                for v in row:
                    if isinstance(v, str) and (METER_ID_RE.match(v.strip())
                                               or COMMUNITY_ID_RE.match(v.strip())):
                        add(v)
        ws = wb["Summary"]
        for r in range(1, ws.max_row + 1):
            a = ws.cell(row=r, column=1).value
            if isinstance(a, str) and METER_ID_RE.match(a.strip()):
                add(ws.cell(row=r, column=2).value)

    # Woerter, die auch ohne Personenbezug vorkommen duerfen
    sensitive -= {"Netz OÖ", "NetzOÖ", "DYNAMIC", "QUARTER", "Unbekannt"}
    return sensitive, real_names


# ---------------------------------------------------------------------------

def generate(src, out):
    out.mkdir(parents=True, exist_ok=True)
    _, real_names = collect_sensitive(src)
    owners = None
    for name, target in FILES:
        wb = openpyxl.load_workbook(src / name)
        if name.startswith("EEG-Masterdata"):
            owners = anonymize_masterdata(wb)
        elif name.startswith("ZP_PODLIST"):
            anonymize_podlist(wb)
        elif name.startswith("Energy-Report"):
            anonymize_energy_report(wb, owners, real_names)
        else:
            sys.exit(f"keine Regel fuer {name}")
        wb.save(out / target)
        print(f"{name} -> {out / target}")
    ids = {}
    for name, _ in FILES:
        wb = openpyxl.load_workbook(src / name, read_only=True)
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                for v in row:
                    if isinstance(v, str) and METER_ID_RE.match(v.strip()):
                        ids.setdefault(fake_meter_id(v.strip()), set()).add(v.strip())
    clashes = {k: v for k, v in ids.items() if len(v) > 1}
    if clashes:
        sys.exit(f"synthetische IDs kollidieren: {clashes}")
    print(f"{len(ids)} Zaehlpunkt-IDs abgebildet, keine Kollision")


def verify(src, out):
    sensitive, _ = collect_sensitive(src)
    # ganze Woerter: "Muster", "Bauer" oder "Hofer" sind auch echte Nachnamen,
    # duerfen aber in "Mustermann" oder "Beispielbauer" stecken
    patterns = {v: re.compile(r"(?<!\w)" + re.escape(v.lower()) + r"(?!\w)") for v in sensitive}
    findings = []
    for _, target in FILES:
        path = out / target
        if not path.exists():
            findings.append(f"{target}: fehlt")
            continue
        wb = openpyxl.load_workbook(path)
        for sheet in wb.worksheets:
            for row in sheet.iter_rows():
                for cell in row:
                    texts = []
                    if cell.value is not None:
                        texts.append(str(cell.value))
                    if cell.comment is not None:
                        texts.append(cell.comment.text)
                    for text in texts:
                        if text.startswith("="):
                            continue  # Formeln wie =TRUE()
                        low = text.lower()
                        for original, pattern in patterns.items():
                            if pattern.search(low):
                                findings.append(
                                    f"{target} {sheet.title}!{cell.coordinate}: "
                                    f"'{original}' in {text!r}")
    checked = len(sensitive)
    if findings:
        print("\n".join(findings))
        print(f"\n{len(findings)} Fundstellen ({checked} sensible Werte geprueft)")
        return 1
    print(f"ok: keiner der {checked} sensiblen Werte der Originale kommt in den Fixtures vor")
    return 0


def show_map(src, keys):
    wb = openpyxl.load_workbook(src / "EEG-Masterdata.xlsx", read_only=True)
    ws = wb["Mitglieder"]
    col = header_index(ws)
    members = {}
    for r in range(2, ws.max_row + 1):
        no = s(ws.cell(row=r, column=col["Mit. Nr."]).value)
        if no and no not in members:
            business = s(ws.cell(row=r, column=col["teilnahme als"]).value) == "Business"
            members[no] = fake_company(no) if business else " ".join(fake_person(no))
    for key in keys:
        if METER_ID_RE.match(key):
            print(f"{key} -> {fake_meter_id(key)}")
        elif key in members:
            print(f"Mitglied {key} -> {members[key]}")
        else:
            print(f"{key}: weder Zaehlpunkt-ID noch Mitgliedsnummer")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC, help="Ordner mit den echten Exporten")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Zielordner der Fixtures")
    ap.add_argument("--verify", action="store_true", help="Fixtures auf Reste der Originale pruefen")
    ap.add_argument("--map", nargs="+", metavar="ID|NR", help="Abbildung fuer ZP-IDs / Mitgliedsnummern zeigen")
    args = ap.parse_args()
    if args.map:
        show_map(args.src, args.map)
    elif args.verify:
        sys.exit(verify(args.src, args.out))
    else:
        generate(args.src, args.out)


if __name__ == "__main__":
    main()
