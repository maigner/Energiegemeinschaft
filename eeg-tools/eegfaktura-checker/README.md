# eegfaktura-checker

Prüft die EEG-Faktura-Exporte (Masterdata, ZP-Podlist, Energy-Report) vor der
Abrechnung. Der Checker ist der Offline-Rückfall zur Prüfungsseite der Website
und die Kommandozeile zur Bibliothek `eegfaktura-datalib`.

## Aufruf

    cargo run -p eegfaktura-checker -- [--format text|json] [--nachforderung] <ordner>

Im Ordner werden jeweils die neuesten passenden Dateien genommen:

- Masterdata: `*EEG-Masterdata-<datum>.xlsx`
- Podlist: `*ZP_PODLIST.xlsx`
- Energy-Report: `*Energy-Report-<start>_<ende>.xlsx`

Exit-Code 1, wenn eine Prüfung etwas findet, 0 wenn alles sauber ist, 2 bei
Bedienfehlern oder wenn eine Datei fehlt.

## Ausgabe

- Ohne Option (oder `--format text`): die lesbaren Abschnitte Masterdata,
  Besitzwechsel, Energy-Report und Aktivierungsfenster.
- `--format json`: alle Prüfergebnisse als ein JSON-Dokument auf stdout
  (`folder`, `files`, `masterdata`, `ownership`, `energy`, `activation`,
  `has_issues`; die Felder entsprechen den Structs in
  `eegfaktura-datalib/src/eegfaktura/checks/mod.rs`). Fehlermeldungen gehen
  nach stderr, stdout bleibt reines JSON.
- `--nachforderung`: nur das, was für die Nachforderung beim Netzbetreiber
  gebraucht wird, eine Zeile je Zählpunkt mit Zählpunkt-ID, Name und den
  betroffenen Tagen (fehlende Werte und L3-Werte) als Bereiche:

      AT0030000000000000000000000120411 Max Mustermann 2025-10-01..2025-10-03, 2025-10-17

  Das ersetzt die frühere sed/cut-Zeile über die Textausgabe.

## Tests

    cargo test -p eegfaktura-checker

Die Integrationstests in `tests/cli.rs` starten das Binary über die
anonymisierten Fixtures in `../eegfaktura-datalib/fixtures/` (siehe
`scripts/anonymize-fixtures.py`). Echte Exporte zum manuellen Ausprobieren
liegen gitignored in `test-files/`.
