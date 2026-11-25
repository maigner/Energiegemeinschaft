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
../../.venv/bin/python eegfaktura_import.py --month 2026-10       # ganzer Monat, gibt den Energiebericht frei
../../.venv/bin/python eegfaktura_import.py --report-month        # wie der Timer auf s1
```

Verhalten:

- Fenster ohne `--from`: letzter Tag in der DB minus 14 Tage (`--overlap-days`)
  bis gestern, höchstens 92 Tage je Lauf (`--max-days`). Netz OÖ liefert spät
  und teilweise nach, deshalb die Überlappung.
- Komplettimport vor dem Energiebericht: Nachlieferungen kommen auch später
  als 14 Tage (am 3.10.2026 fehlte die halbe Gemeinschaft, die Werte kamen
  erst Wochen danach, und der Oktober-Bericht ging ohne diesen Tag hinaus).
  Mit `--report-month` (so läuft der Timer auf s1) beginnt das Fenster am
  Ersten des Vormonats, solange für den Vormonat noch kein Bericht in
  `members_energyreportlog` steht, längstens bis zum 20. des Monats.
  `--month YYYY-MM` holt einen Monat von Hand. Jeder Lauf, der einen
  Kalendermonat lückenlos, mit allen Zählpunkten und mit aufgefrischten Views
  geholt hat, vermerkt das in `metering_monthimport` (Migration metering
  0008). Die Website beginnt den Versand eines Monats nur mit einem Vermerk
  vom selben Tag; fällt der Import aus, wartet der Bericht auf den nächsten
  erfolgreichen Lauf.
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
- Das Qualitätskennzeichen `qov` je Wert landet in `metering_measurement.quality`
  (1 = L1, 2 = L2, 3 = L3, 0 = unbekannt; NULL für Werte vor November 2026
  und aus dem Excel-Notebook). Eine geänderte Qualität zählt als Änderung.
  Rückwirkend füllen: `--from`/`--to` über den Zeitraum laufen lassen.
- Nach dem Schreiben holt der Lauf einmal die Metadaten des Energystores
  und schreibt `periodBegin`/`periodEnd` je Zählpunkt nach
  `members_measurementpoint.store_period_begin/_end` (`--no-metadata`
  unterdrückt das); die Abrechnungsprüfung der Website vergleicht sie mit
  Masterdata und Podlist.

## Täglich: `eegfaktura_masterdata.py`

Holt `GET /api/master/masterdata` (Basic-Auth, Standard-Base64, Header
`X-Tenant`) und schreibt Status, Richtung und Aktivierungsfenster je
Zählpunkt nach `members_measurementpoint` (`status`, `type`, `activated_at`,
`deactivated_at`). Legt nichts an: E-Mail, Adresse und Tarif liefert die
API nicht, neue Mitglieder kommen weiter über das Masterdata-Sheet (Import
auf `/board/members`). Unbekannte Zählpunkte, bei EEG-Faktura umgezogene
und bei uns aktive, die die API nicht kennt, stehen im Log. Auf s1 täglich
04:40 (`eegfaktura-masterdata.timer`), `--dry-run` vergleicht nur.

Täglich läuft das auf s1 um 05:00 (`scripts/eegfaktura-import/`, Log
`journalctl -u eegfaktura-import`), um 05:30 folgt unabhängig davon der
Prognoselauf (`eeg-forecast.timer`, Log `journalctl -u eeg-forecast`), siehe
`docs/server-setup.md`.

Die API-Semantik (Millisekunden, Wertereihenfolge, Standard-Base64 im
Auth-Header) steht im Docstring des Skripts und stammt aus dem Quellcode
des Energystores (github.com/eegfaktura/eegfaktura-energystore).

## Manuell: `EEG Faktura Energy Report.ipynb`

Rückfall, wenn die API nicht erreichbar ist: Excel-Energy-Report aus
EEG-Faktura nach `~/Downloads` laden, Notebook von oben nach unten laufen
lassen (Import, Views, Prognose, Wetter, Backtest). Schreibt dieselben
Zeilen mit demselben Upsert.

`Check Data.ipynb` prüft Lieferlücken; `Faktura Export/` und `NetzOÖ/`
sind gitignorierte Datenablagen.

## Quartalscharts für die Generalversammlung: `quartalscharts.py`

Verbrauch, Erzeugung, Eigendeckung, Verteilung der Erzeugung (von Mitgliedern
verbraucht gegen Überschuss), Deckungsgrad und Zählpunkt-Wachstum je Quartal,
Berichtsjahr gegen Vorjahr, aus `daily_metering_quality`. Schreibt PNGs
(2200 px breit, für Folien) und eine Sammel-PDF nach `generalversammlung/`.

```bash
cd notebooks/energyData
../../.venv/bin/python quartalscharts.py              # 2025 gegen 2024
../../.venv/bin/python quartalscharts.py --year 2026  # 2026 gegen 2025
```

Unter jeder Säule steht die Zahl der Zählpunkte am Quartalsende, weil der
Jahresvergleich der absoluten Mengen vor allem das Wachstum der Gemeinschaft
zeigt. Farben: Markengrün der Website als Akzent, Grau für das Vorjahr, Blau
für den Überschuss (Grün/Orange fällt bei Rot-Grün-Schwäche zusammen).
