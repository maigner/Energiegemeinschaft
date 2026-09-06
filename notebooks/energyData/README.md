# Energiedaten (EEG-Faktura)

Viertelstundenwerte je Zählpunkt landen in `metering_measurement`
(fünf Meter-Codes: Gesamtverbrauch, Anteil gemeinschaftliche Erzeugung,
Eigendeckung, Gesamte gemeinschaftliche Erzeugung, Gemeinschaftsüberschuss).

## Automatisch: `eegfaktura_import.py`

Holt die Daten direkt aus dem Energystore von EEG-Faktura (Basic-Auth mit der
normalen EEG-Faktura-Anmeldung, Header `X-Tenant`). Zugangsdaten in
`notebooks/.env` (Vorlage `notebooks/.env.example`, gitignoriert). Neben dem
RC-Nummer-Tenant braucht die API die 33-stellige Gemeinschafts-ID (`EC_ID`,
Stammdaten in EEG-Faktura oder Blatt Summary des Energy-Reports): der
Energystore fuehrt je Tenant und Gemeinschaft einen eigenen Speicher und
antwortet bei einer falschen ID stumm mit einem leeren Ergebnis.

```bash
cd notebooks/energyData
../../.venv/bin/python eegfaktura_import.py --metadata            # Zählpunkte bei EEG-Faktura
../../.venv/bin/python eegfaktura_import.py --verify 2026-08-20   # Tag holen, mit DB vergleichen
../../.venv/bin/python eegfaktura_import.py --dry-run             # Fenster holen, nichts schreiben
../../.venv/bin/python eegfaktura_import.py                       # Import + Materialized Views
../../.venv/bin/python eegfaktura_import.py --forecast            # zusätzlich Prognoselauf speichern
../../.venv/bin/python eegfaktura_import.py --from 2026-07-01 --to 2026-07-31
```

Verhalten:

- Fenster ohne `--from`: letzter Tag in der DB minus 14 Tage (`--overlap-days`)
  bis gestern, höchstens 92 Tage je Lauf (`--max-days`). Netz OÖ liefert spät
  und teilweise nach, deshalb die Überlappung.
- Schonend für die API: ein Tag je Anfrage (`--chunk-days`), alle Zählpunkte
  auf einmal (Liste aus `members_measurementpoint`, `--cps api` überlässt die
  Auswahl dem Server), 5 s Pause (`--pause`), Wiederholung nur bei Server- oder
  Netzfehlern, bei 403 sofortiger Abbruch (jeder Aufruf ist eine
  Keycloak-Anmeldung).
- Ein Tag je Transaktion, Upsert auf (Zählpunkt, Meter-Code, Zeitstempel);
  unveränderte Werte werden nicht angefasst. Die Ausgabe zählt neu, geändert
  und "auf 0 gesetzt" (vorhandene Werte, die die Lieferung nullt).
- Danach `weekly_metering_summary`, `daily_metering_summary` und
  `daily_metering_quality` auffrischen (`--no-refresh` unterdrückt das), mit
  `--forecast` anschließend `../forecast/eeg_forecast.py --refresh --days 30 --store`
  (nur für Läufe von Hand; auf s1 hat die Prognose ihren eigenen Timer).
- `--verify TAG` schreibt nichts, sondern vergleicht die Antwort mit der DB
  (Trefferquote bei Versatz 0, ±1 h, ±2 h und Tagessummen je Meter-Code).
  Vor dem ersten echten Lauf gegen einen Tag prüfen, der schon in der DB
  liegt; meldet die Ausgabe einen Versatz, `--ts-shift-minutes` setzen.
- Zählpunkte, die EEG-Faktura kennt, aber `members_measurementpoint` nicht,
  werden übersprungen und am Ende aufgelistet.

Täglich läuft das auf s1 um 05:00 (`scripts/eegfaktura-import/`, Log
`journalctl -u eegfaktura-import`), um 05:30 folgt unabhängig davon der
Prognoselauf (`eeg-forecast.timer`, Log `journalctl -u eeg-forecast`), siehe
`docs/server-setup.md`.

Die API-Semantik (Millisekunden, Wertereihenfolge, URL-sicheres Base64 im
Auth-Header) steht im Docstring des Skripts und stammt aus dem Quellcode
des Energystores (github.com/eegfaktura/eegfaktura-energystore).

## Manuell: `EEG Faktura Energy Report.ipynb`

Rückfall, wenn die API nicht erreichbar ist: Excel-Energy-Report aus
EEG-Faktura nach `~/Downloads` laden, Notebook von oben nach unten laufen
lassen (Import, Views, Prognose, Wetter, Backtest). Schreibt dieselben
Zeilen mit demselben Upsert.

`Check Data.ipynb` prüft Lieferlücken; `Faktura Export/` und `NetzOÖ/`
sind gitignorierte Datenablagen.
