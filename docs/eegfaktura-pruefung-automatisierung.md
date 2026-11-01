# Plan: Abrechnungsprüfung automatisieren (EEG-Faktura-Daten vor der Abrechnung)

Stand: 2026-11-01. Betrifft `eeg-tools/` (Checker, Datalib, Tauri-Client),
den Energiedaten-Import auf s1 (`notebooks/energyData/eegfaktura_import.py`,
`scripts/eegfaktura-import/`), den Stammdaten-Import der Website
(`website/src/lib/server/nextcloud/members/memberdata.js`) und ein neues
Vorstands-Dashboard `/board/energy/pruefung`.

**Umsetzungsstand (2026-11-01):** Stufe 5, Weg 3 (Podlist aus dem Postfach) ist gebaut: `website/src/lib/server/podlist/`, Migration `members 0041` (`members_podlistimport`, `members_podlistentry`; abweichend vom Plan unten eine Zeile je Aktivierungsfenster statt Spalten am Zählpunkt, weil ein Zählpunkt bei Änderung des Teilnahmefaktors mehrmals in der Liste steht), Cron alle 10 Minuten, Anzeige auf `/board/members/import`, CLI `scripts/podlist-fetch.js`. Postfach ist info@ischlstrom.org (nicht ein eigenes), der Job markiert und verschiebt nichts. Probelauf gegen das echte Postfach am 2026-11-01 fand beide Listen (28.09. und 01.11.). Migration 0041 auf Prod und Deploy am 2026-11-01 13:13; der erste Lauf um 13:14 hat beide Listen übernommen und in Nextcloud abgelegt. Alle anderen Stufen sind nicht umgesetzt; `members 0041` ist damit vergeben, Stufe 1 bekommt 0042.

## Ziel

Vor jeder Quartalsabrechnung soll der Vorstand ohne Handarbeit wissen, ob die
Daten in EEG-Faktura abrechnungsreif sind: Energiedaten vollständig und ohne
L3-Werte, Stammdaten mit Tarif und Aktivierungsdatum, Besitzwechsel sauber,
Aktivierungsfenster zwischen Stammdaten, Netzbetreiber und Energiespeicher
konsistent. Was heute drei Excel-Exporte, ein Checker-Lauf und eine
sed/cut-Pipeline sind, wird eine Seite im Vorstandsbereich plus eine
Signal-Nachricht, wenn sich etwas ändert.

## Ist-Zustand

Manueller Ablauf je Abrechnung:

1. In EEG-Faktura anmelden, drei Dateien exportieren: Masterdata
   (`*EEG-Masterdata-<datum>.xlsx`) und Energy-Report für den Zeitraum
   (`*Energy-Report-<start>_<ende>.xlsx`); die ZP-Podlist
   (`*ZP_PODLIST.xlsx`) in EEG-Faktura anfordern, sie kommt als
   Mail-Anhang. Alles nach `~/Downloads`.
2. `cargo run -p eegfaktura-checker -- ~/Downloads` oder den Tauri-Client
   starten, Ausgabe lesen.
3. Fehlende Tage je Zählpunkt mit der sed/cut-Zeile aus
   `eeg-tools/eegfaktura-checker/README.md` zur Nachforderungsliste machen,
   Nachforderung bei Netz OÖ über EEG-Faktura auslösen, nach Lieferung
   Schritt 1 bis 3 wiederholen.
4. Unabhängig davon das Masterdata-Sheet nach Nextcloud
   (`/website/board/members/import`) laden, damit die Website es importiert.

Was es schon gibt und der Plan wiederverwendet:

- Die Viertelstundenwerte liegen seit September 2026 täglich um 05:00 in
  `metering_measurement` (Energystore-API, Basic-Auth). Die API liefert je
  Wert ein Qualitätskennzeichen `qov` (1 = L1, 2 = L2, 3 = L3, 0 =
  unbekannt); das Skript zählt es nur und wirft es weg.
- Der Stammdaten-Import der Website liest das Sheet `Mitglieder` bereits
  mit allen Spalten, die die Datalib-Prüfungen brauchen (`ZP-Status`,
  `aktiviert`, `deaktiviert`, `Zp. Tarifname`), speichert davon aber nur
  `type` und `status`. Doppelt vergebene Mitgliedsnummern werden schon
  geprüft (`masterdataConflicts.js`).
- Das EEG-Faktura-Backend liefert die Stammdaten als JSON unter
  `GET /api/masterdata` (Basic-Auth wie der Energystore, Header `X-Tenant`;
  je Zählpunkt `status`, `direction`, `activeSince`, `inactiveSince`) und die
  Excel-Datei unter `GET /eeg/export/masterdata` (Bearer-Token). Der
  Energystore kennt je Zählpunkt sein gespeichertes Fenster
  (`GET /eeg/v2/{ecid}/meta`, `--metadata` im Import-Skript).
- Upstream gibt es seit 2026-10-18 den Endpoint `billing-check` im
  Energystore (platform#148) und im Web-Client den Dialog
  `BillingCheck.dialog.tsx`: L3-Werte, fehlende Viertelstunden je
  Aktivierungsfenster, erster/letzter Wert, Tarif vorhanden, Erzeugung
  vollständig zugeteilt. Das deckt `EnergyReportChecks` und die Tarifhälfte
  von `MasterdataChecks` ab; Besitzwechsel und der Vergleich der
  Aktivierungsfenster über drei Quellen fehlen dort.

## Stufen

Reihenfolge nach Nutzen je Aufwand. Stufe 1 und 2 ersetzen den Energy-Report
und den Checker-Lauf, Stufe 3 und 4 den Masterdata-Export und den
Nextcloud-Upload, Stufe 5 das Herunterladen und Prüfen der Podlist von
Hand (angefordert wird sie weiter in EEG-Faktura, sie kommt per Mail). Jede Stufe ist für sich nützlich.

### Stufe 1: Qualität und Aktivierungsfenster in die DB (ca. 1 Tag)

Datenmodell (Django-Migrationen in `middleware/`, SQL in der Website
nachziehen):

- `metering 0006`: `Measurement.quality` (smallint, NULL für Altdaten;
  Werte 0 bis 3 wie `qov`).
- `members 0041`: `MeasurementPoint.activated_at`, `deactivated_at` (date,
  NULL), `subscription_name` (varchar, NULL) aus den Sheet-Spalten
  `aktiviert`, `deaktiviert`, `Zp. Tarifname`. Datumswerte kommen aus
  `sheet_to_json` als Excel-Serial oder String `TT.MM.JJJJ`; als reines
  Datum speichern, nie über ein `Date`-Objekt mit Zeitzone (Europe/Vienna,
  bekannte Fehlerquelle).

Import (`eegfaktura_import.py`):

- `rows_from_payload` behält je Wert das `qov`, `upsert_rows` kopiert eine
  Spalte `quality` mit und aktualisiert sie im `ON CONFLICT`, wenn Wert oder
  Qualität abweichen. `--verify` zeigt die Qualitätsverteilung weiter wie
  bisher.
- Rückfüllen: ein Lauf `--from <Quartalsbeginn> --to gestern` je offenem
  Abrechnungszeitraum (höchstens 92 Tage je Lauf, 5 s Pause, also rund
  10 Minuten je Quartal). Ältere Daten bleiben ohne Qualität; die Prüfung
  behandelt NULL als "unbekannt", nicht als L3.

Website-Import (`memberdata.js`): die drei neuen Spalten im Upsert mitführen.
Masterdata-Loader der Datalib und Website-Import lesen dieselben
Spaltennamen; das bleibt die Referenz.

### Stufe 2: Prüfung in SQL, Seite und Signal (ca. 2 bis 3 Tage)

Prüflogik:

- `website/src/lib/server/db/energy/billingCheck.js` liefert je Zählpunkt
  für einen Zeitraum: erwartete Viertelstunden im aktiven Fenster
  (Schnitt aus Zeitraum und `activated_at`/`deactivated_at`, Tage in
  Europe/Vienna mit 92 oder 100 Slots am Umstellungstag, `generate_series`
  in timestamptz), vorhandene Werte des Leitcodes je Richtung
  (`Gesamtverbrauch` bzw. `Gesamte gemeinschaftliche Erzeugung`), daraus
  `missing_count`, `missing_days`, `l3_count`, `l3_days`, `first_data`,
  `last_data`; dazu die Summen des Zeitraums (Erzeugung, Verbrauch,
  Zuteilung, Eigendeckung, Überschuss) und die Differenz Erzeugung minus
  Zuteilung wie im Upstream-Dialog.
- `website/src/lib/billingCheck.js` (ohne DB, ohne `$lib`) bewertet die
  Zahlen: Status je Zählpunkt (ok, Lücke, L3, keine Daten), Nachforderungs-
  liste als Zählpunkt plus Tagesbereiche (`1. bis 3.10., 17.10.`), Gesamtstatus.
  Tests mit `node --test` gegen feste Eingaben, auch der Umstellungstag.

Seite `/board/energy/pruefung` ("Abrechnungsprüfung"):

- Zeitraum wählbar, Vorgabe letztes volles Quartal; frei einstellbar für
  Monat oder Jahr.
- Abschnitte: Energiedaten (Tabelle je Zählpunkt mit Mitglied, Status,
  fehlende Tage, L3-Tage), Nachforderung (kopierbarer Textblock, ein
  Zählpunkt je Zeile), Summen und Zuteilungsdifferenz, Stammdaten
  (Stufe 3), Aktivierungsfenster (Stufe 5).
- Markierung "abgerechnet am" je Zeitraum, damit die Signal-Meldung
  (unten) weiß, welcher Zeitraum offen ist. Tabelle
  `metering_billingcheck` (`metering 0007`): `period_start`, `period_end`,
  `checked_at`, `findings_hash`, `summary` (jsonb), `billed_at`.

Signal (`website/src/lib/server/mail/notifications/billingCheckAlerts.js`,
Cron in `hooks.server.js` täglich 06:10, nach dem Import um 05:00):

- Prüft den offenen Zeitraum (letztes volles Quartal, solange `billed_at`
  leer ist), rechnet den `findings_hash` und schickt nur bei Änderung eine
  Nachricht: Zahl der Zählpunkte mit Lücken und L3, Zahl der betroffenen
  Tage, Link auf die Seite. Zusätzlich eine Erinnerung 14 Tage nach
  Quartalsende, wenn die Prüfung nicht grün ist. Gleicher Weg wie die
  IBM-Alarme (`sendSignal`, `SIGNAL_*` in `.env`, keine Mail).

Nach dieser Stufe entfällt der Energy-Report-Export für den Regelfall. Der
Checker bleibt als Rückfall für einen Excel-Report, so wie das Notebook
Rückfall für den Import ist.

### Stufe 3: Stammdaten-Prüfungen im Website-Import (ca. 1 Tag)

`website/src/lib/server/nextcloud/members/masterdataChecks.js`, nach dem
Vorbild von `masterdataConflicts.js` ohne `$lib`/`$env`-Importe, testbar
mit `node --test`:

- Portierung von `MasterdataChecks` (ACTIVE ohne `Zp. Tarifname`, ACTIVE
  ohne `aktiviert`) und `OwnershipChecks` (Zählpunkt unter mehreren
  Mitgliedsnummern: überlappende Fenster, mehr als ein aktiver Besitzer)
  aus `eeg-tools/eegfaktura-datalib/src/eegfaktura/checks/mod.rs`; die
  Rust-Tests dort sind die Vorlage für die Node-Tests.
- Ergebnis wird von `importMemberDataFromNextcloud` zurückgegeben und auf
  `/board/members/import` neben den Konflikten angezeigt; die Prüfungsseite
  aus Stufe 2 zeigt denselben Block.

### Stufe 4: Masterdata täglich von EEG-Faktura holen (ca. 1 Tag plus Spike)

Ziel: kein Export und kein Nextcloud-Upload mehr; der Import auf
`/board/members` sieht jeden Morgen das aktuelle Sheet.

- Neues Skript `notebooks/energyData/eegfaktura_masterdata.py`, gleiche
  Umgebung wie der Import (`/etc/eegfaktura-import.env`), Timer
  `eegfaktura-masterdata.timer` 04:40 auf s1 (vor dem Keila-Sync um 04:50,
  der die Mitglieder aus der DB liest). Installation über
  `scripts/eegfaktura-import/install-on-s1.sh` erweitern.
- Bevorzugter Weg: `GET /eeg/export/masterdata` als Excel, Datei mit dem
  heutigen Datum im Namen per WebDAV nach `/website/board/members/import`
  legen (Nextcloud-App-Passwort in der env-Datei). Der bestehende Import
  bleibt unverändert, und das Sheet bleibt die eine Quelle für Website,
  Checker und Datalib.
- Spike vorab (eine Stunde): Basis-URL des Backends und Keycloak-Realm,
  Client-ID und Passwort-Grant aus `eegfaktura-web/src/service/keycloak.service.ts`
  nachvollziehen; prüfen, ob der Export mit dem Token einer normalen
  Benutzeranmeldung geht. Falls nicht: `GET /api/masterdata` (Basic-Auth,
  JSON) holen und daraus mit openpyxl ein Sheet im Layout des Exports
  schreiben; das ist der Rückfall, weil das Layout dann zwei Stellen hat.
- Alle 30 Tage eine Datei behalten, ältere im Ordner löschen (der Import
  nimmt das jüngste Datum im Namen).

### Stufe 5: Podlist aus der Mail übernehmen, Energystore-Fenster als Spalten (ca. 1 bis 2 Tage)

Die Podlist wird in EEG-Faktura angefordert und kommt als Mail-Anhang
(`*ZP_PODLIST.xlsx`, Blatt `ZP-List`: Zählpunkt in Spalte B, Teilnahme-
faktor E, `aktiviert` G, `aktiv seit` H, `aktiv bis` I, Datumswerte als
Excel-Serial). Es gibt keinen Endpoint, den s1 abfragen könnte; der Weg
in das System ist deshalb eine Ablage, die die Website einliest, und
optional ein Postfach, das die Mail selbst verarbeitet.

Datenmodell (`members 0042`): `MeasurementPoint.grid_activated_at`,
`grid_active_since`, `grid_active_until`, `grid_participation_factor`
(Netz OÖ laut Podlist), `store_period_begin`, `store_period_end`
(Energystore-Metadaten); Tabelle `members_podlistimport` (`received_at`,
`file`, `rows`, `source` = `nextcloud` | `upload` | `mail`), damit die
Prüfungsseite das Alter der letzten Podlist zeigt und eine veraltete
Podlist (älter als der Abrechnungszeitraum) als Warnung meldet.

Import `website/src/lib/server/nextcloud/members/podlist.js`: liest das
Blatt `ZP-List` über Spaltennamen (nicht Positionen), schreibt die vier
Netz-Spalten per Upsert auf `identifier`, meldet Zählpunkte, die in der
Podlist stehen, aber nicht in `members_measurementpoint`, und umgekehrt
ACTIVE-Zählpunkte ohne Podlist-Zeile. Derselbe Code für alle drei
Eingangswege.

Eingangswege, aufeinander aufbauend:

1. **Nextcloud-Ablage (kein neuer Code außer dem Import).** Anhang aus der
   Mail in den Ordner `/website/board/members/import` legen (per
   Desktop-Client ein Drag-and-drop). `importMemberDataFromNextcloud` nimmt
   zusätzlich die jüngste `*ZP_PODLIST*.xlsx` (Datum aus `lastmod`, weil
   der Dateiname keines trägt; beim Ablegen daher am besten das Datum
   voranstellen, `20261101-RC101533-ZP_PODLIST.xlsx`) und ruft den
   Podlist-Import auf. Ergebnis erscheint auf `/board/members/import`.
2. **Upload auf der Prüfungsseite.** Formular "Podlist hochladen" auf
   `/board/energy/pruefung` nach dem Muster von
   `routes/api/finance/bookings/uploadAttachment/+server.ts`: Datei mit
   Datumspräfix in denselben Nextcloud-Ordner schreiben, dann den Import
   aufrufen und das Ergebnis direkt anzeigen. Spart den Umweg über den
   Desktop-Client, eine Stunde Aufwand.
3. **Postfach (optional, volle Automatik).** Alias oder Postfach
   `podlist@ischlstrom.org` in mailcow (die Website legt Aliase schon über
   `lib/server/mailcow.js` an). Die Mail aus EEG-Faktura dorthin
   weiterleiten (Weiterleitungsregel im eigenen Postfach, oder die Adresse
   in EEG-Faktura als Empfänger eintragen, falls das geht). Cron in
   `hooks.server.js` alle 10 Minuten: per IMAP (`imapflow`, neue
   Abhängigkeit; Zugang `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`,
   `IMAP_PASSWORD` in `.env`, seit 2026-11-01 in `.env.s1` eingetragen) neue Mails
   holen, Anhänge mit `ZP_PODLIST` im Namen und gültigem Blatt `ZP-List`
   in den Nextcloud-Ordner schreiben, Import aufrufen, Mail in einen Ordner
   "Verarbeitet" verschieben, bei Fehlern per Signal melden. Absender wird
   nicht geprüft (die Datei validiert sich über Blatt und Spalten), aber
   nur Anhänge bis 5 MB und nur xlsx. Gleicher Weg könnte später auch das
   Masterdata-Sheet nehmen, falls EEG-Faktura es per Mail schicken kann.

Energystore-Fenster: das Import-Skript holt `--metadata` ohnehin; einmal
je Lauf die Fenster in `store_period_begin`/`store_period_end` schreiben.

Prüfung (SQL, Vergleich dreier Spaltenpaare je Zählpunkt): Startdaten
müssen über die Quellen gleich sein, Enddaten nach Normalisierung der
Sentinels (2999-12-31 und 9999-12-31 = offen); ACTIVE ohne Podlist-Zeile
und Podlist-Zeile ohne Stammdaten melden; Podlist älter als der
Zeitraumbeginn als Warnung. Logik und Sonderfälle stehen fertig in
`checks/mod.rs` (Datalib), die Rust-Tests sind die Vorlage.

### Stufe 6: Nachforderung aus der Seite auslösen (optional, Spike zuerst)

Das Backend hat ein Paket `energyrequest` und Prozess-Endpoints
(`/process/history`, `/{pid}/register`). Spike: welcher Endpoint löst die
EDA-Nachforderung ("Energiedaten anfordern") je Zählpunkt und Zeitraum aus,
und akzeptiert er Tagesbereiche. Wenn ja: Knopf "Nachforderung senden" auf
der Prüfungsseite, der genau die fehlenden Tage je Zählpunkt anfordert und
den Zeitpunkt in `metering_billingcheck.summary` vermerkt, damit die
Signal-Meldung eine offene Nachforderung von einer neuen Lücke
unterscheidet. Wenn nein: der kopierbare Block aus Stufe 2 bleibt.

### Stufe 7: Upstream und Rückbau von eeg-tools (laufend)

- Besitzwechsel- und Aktivierungsfenster-Prüfung als Beitrag zu
  platform#148 (Energystore `billing-check` plus `BillingCheck.dialog.tsx`),
  mit den Testfällen aus `checks/tests/`. Danach hat jede Gemeinschaft die
  Prüfung ohne Export.
- `eeg-tools` wird zum Offline-Rückfall: Datalib und Checker bleiben,
  bekommen `--format json` und einen Modus `--nachforderung` (ersetzt die
  sed/cut-Zeile); der Tauri-Client wird entfernt, sobald die Seite aus
  Stufe 2 läuft.
- Loader für Podlist und Energy-Report auf Spaltennamen umstellen (wie der
  Masterdata-Loader seit dem Spaltenschub vom November 2026).
- Die `MISSING value`-Ausgabe je Sample im Energy-Report-Loader entfernen.
- Echte Mitgliederexporte in beiden `test-files/` durch anonymisierte
  Fixtures ersetzen, damit `cargo test` überall läuft.

## Neuer Standardablauf nach Stufe 1 bis 4

1. Nichts herunterladen. Der Import holt um 04:40 die Stammdaten und um
   05:00 die Energiedaten; um 06:10 läuft die Prüfung. Die Podlist vor
   der Abrechnung in EEG-Faktura anfordern; die Mail landet im Postfach
   (Stufe 5, Weg 3) oder der Anhang wird auf der Prüfungsseite hochgeladen.
2. Signal meldet, wenn sich der Befund für das offene Quartal ändert, und
   erinnert 14 Tage nach Quartalsende, solange die Prüfung nicht grün ist.
3. Auf `/board/energy/pruefung` die Nachforderung kopieren (oder ab Stufe 6
   senden), in EEG-Faktura auslösen. Stammdatenfehler in EEG-Faktura
   korrigieren; der nächste Import zieht sie nach.
4. Ist die Seite grün, Abrechnung in EEG-Faktura starten und den Zeitraum
   als abgerechnet markieren.

Manuell bleibt: die Beurteilung eines ungewöhnlichen Besitzwechsels, die
Korrektur der Stammdaten in EEG-Faktura und das Warten auf Netz OÖ.

## Rollout je Stufe

- Migrationen laufen gegen Prod (`manage.py migrate` trifft s1, siehe
  `docs/db-setup.md`); zuerst auf der Dev-Kopie auf `server` durchspielen.
- Website-Deploy (`deploy-server.sh`, `update-docker-container.sh`), dann
  `install-on-s1.sh` für die Python-Skripte und Timer.
- Rückfüllen der Qualität für das offene Quartal direkt nach Stufe 1, als
  Vergleichslauf vorher `--verify` auf einen Tag im Quartal.
- Erster Vergleich: Checker gegen den letzten Excel-Report desselben
  Quartals laufen lassen und mit der Seite abgleichen (gleiche Zählpunkte,
  gleiche Tage); Abweichungen vor dem Abschalten des Checker-Laufs klären.

## Risiken und offene Fragen

- `qov` 0 heißt "keine Lieferung" für den ganzen Tag (wird übersprungen);
  ob einzelne Viertelstunden mit `qov` 0 zwischen echten Werten vorkommen,
  prüft der erste Rückfüll-Lauf (Zählung in `--verify`). Sie zählen als
  fehlend, nicht als L3.
- Der Energy-Report bildet Aktivierungsfenster aus den Stammdaten ab; die
  DB-Prüfung muss dieselben Fenster nehmen (Stufe 1), sonst meldet sie
  Lücken vor der Aktivierung.
- Jeder API-Aufruf ist eine Keycloak-Anmeldung; Stufe 4 ist ein Aufruf am
  Tag, Stufe 5 einer mehr (Metadaten). Bei 403 sofort abbrechen, wie im
  Import.
- `activated_at`/`deactivated_at` über `sheet_to_json`: Excel-Serial gegen
  String, Umstellungstag, Zeitzone. Mit einer festen Zeile im Node-Test
  absichern.
- Dev-Server ohne Cron: die Prüfung muss sich auch von Hand über die Seite
  auslösen lassen (Button "jetzt prüfen"), sonst ist sie lokal nicht
  testbar.
- Die Dev-Kopie auf `server` ist anonymisiert; Stammdaten-Prüfungen gegen
  echte Namen nur über die Prod-DB (lokales `npm run dev` nutzt sie).

## Aufwand

| Stufe | Aufwand | Ersetzt |
|---|---|---|
| 1 Qualität + Fenster in DB | 1 Tag | Grundlage |
| 2 SQL-Prüfung, Seite, Signal | 2 bis 3 Tage | Energy-Report-Export, Checker-Lauf, sed/cut |
| 3 Stammdaten-Prüfungen im Import | 1 Tag | Masterdata-Teil des Checkers |
| 4 Masterdata täglich per API | 1 Tag + Spike | Masterdata-Export, Nextcloud-Upload |
| 5 Podlist aus der Mail, Energystore-Fenster | 1 bis 2 Tage | Podlist-Download, Aktivierungsvergleich |
| 6 Nachforderung aus der Seite | Spike, dann 1 Tag | Nachforderung in der EEG-Faktura-UI |
| 7 Upstream, Rückbau | laufend | Tauri-Client, Pflege doppelter Prüfungen |
