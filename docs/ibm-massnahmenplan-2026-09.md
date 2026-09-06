# Massnahmenplan IBM: Abweichungen aus dem Betriebs-Audit beheben

Stand: 2026-09-06. Grundlage ist ein Audit der acht laufenden Anlagen ueber
die Status-Historie der letzten 30 Tage (`members_openhabstatushistory`,
5-Minuten-Raster) und die Prognosetabellen auf s1. Betrifft
`Batteriemanagement/openhab/control/core.js`, die Token-API
`/api/ibm/ladefenster/v1`, das Vorstands-Dashboard `/board/openhab`, die
Notebooks unter `notebooks/forecast/` und `notebooks/energyData/` sowie die
Setup-Skripte der Pis.

## Befund in Kuerze

Was passt:

- Nacht: Entladung beginnt zum Entladestart des Servers, das Nachtbudget
  haelt Reserve plus Hauslast zurueck, die Einspeisung (bis ~13 kW Flotte)
  liegt weit unter dem naechtlichen Defizit der Gemeinschaft (90-190 kW).
- Netzladeschutz: zwei Ausloesungen in 30 Tagen, beide Abtast-Artefakte an
  teilbewoelkten Tagen, je ein 5-Minuten-Slot gesperrt. Kein echtes Netzladen.
- Alle Pis online, Paket 2026-08-31, keine Drosselung, kein Reboot offen.

Was abweicht:

1. Die gelernte Ladeleistung ist eine untere Huelle (1,5-4,6 kW) und liegt
   um Faktor 1,5 bis 3,5 unter der echten Ladeleistung (3-7 kW). Der
   PWM-Sperranteil wird damit fuer die grossen Batterien (pi-007, pi-368,
   zusammen 76 von 141 kWh) meist 0: sie laden ab dem ersten Sonnenschein
   mit voller Leistung. Der Server rechnet mit derselben Zahl "braucht den
   ganzen Tag, keine Sperre" fuer vier von sieben Anlagen.
2. Alles Tagesaktuelle haengt am Prognoselauf, und der letzte ist vom
   2026-09-01 (Lauf 23). Am 09-03 sagte er ein Viertel der Erzeugung vom
   09-01 voraus, real waren es 85%. Folge: Restladezeit 1,3 h um 08:00,
   Regelung gab alles frei, pi-118 und pi-279 um 11:30 voll, Export von
   8-10 kW in den 400-kW-Mittagsueberschuss, Entladung ab 16:52 bei noch
   5 kW PV (Prognose sagte Defizit ab 16:15).
3. Die Regelung verteilt das Laden sonnengewichtet ueber 08:15-16:49. Die
   Gemeinschaft ist laut Prognose bis 09:05-09:45 im Defizit. Seit 08-31
   gingen morgens (07:00-09:45) 73 kWh in die Batterien und 38 kWh ins Netz.
4. Entladeende ist der klimatologische Wochen-Crossover (08:38), die
   Prognose hat das Defizit bis 09:05-09:45. Die Flottenleistung fuer den
   Entladestart zaehlt 3 kW je Anlage statt der dynamischen Werte.
5. Mitgliederseite: pi-368 wird vom Besitzer abends abgeschaltet (08-29,
   09-01, 09-05), pi-223 (Sigenergy) seit 08-25 aus und ohne Daten, pi-279
   mit Reserve 50% ohne Wirkung, pi-087 mit fehlgeschlagenen
   Fronius-Steuerbefehlen. pi-118 und pi-047 mit ueber 60 offenen
   apt-Updates.

## Teil A: Steuerung am Pi (`control/core.js`)

### A1. Spitzen-Ladeleistung lernen statt untere Huelle (Abweichung 1)

- Stichproben direkt aus dem Batterieleistungs-Item statt aus dem
  Ladestandsanstieg: in jedem freien Slot zwischen 10:00 und 15:00 bei
  Ladestand 20-90% und Wolkenvorschau unter der Schwelle die Ladeleistung in
  Watt mit Zeitstempel in das JSON-Zustands-Item schreiben (letzte 40
  Stichproben).
- Schaetzung = 80. Perzentil der Stichproben der letzten 7 sonnigen Tage.
  Schnell nach oben, langsam nach unten: eine Stichprobe 30% ueber der
  Schaetzung hebt sie sofort an, Stichproben darunter senken sie nur mit
  7-Tage-Halbwertszeit. Das ist die Umkehr der heutigen Gewichtung.
- SoC-basierte Messung bleibt als Rueckfall fuer Profile ohne
  Batterieleistungs-Item, dann mit symmetrischen Gewichten.
- Zustand versionieren (`version: 2` im JSON); beim ersten Lauf alte
  Schaetzung verwerfen. Bis drei Stichproben vorliegen gilt das heutige
  Maximum der beobachteten Ladeleistung, damit die Regelung am ersten Tag
  nicht blind ist.
- Der neue Wert geht als `ladeleistung_kw` an den Server; das
  individualisierte Sperr-Ende wird damit wieder brauchbar.
- Test: Replay ueber die exportierte 30-Tage-Historie, Sperranteil je Slot
  neu rechnen. Erwartung: pi-007 und pi-368 bekommen morgens einen
  Sperranteil groesser 0, pi-279 und pi-118 erreichen 95% nach 15:00 statt
  11:30-13:30.
- Doku: Whitepaper-Abschnitt Ladeleistungsschaetzung, Kopfkommentar
  core.js, `docs/ibm-setup-vereinfachung.md`.

### A2. Live-PV-Boden fuer die Laderegelung (Abweichung 2, Pi-Seite)

- Je Anlage ein "Sonnenprofil" pflegen: stuendliches 75. Perzentil des
  PV-Items ueber die letzten 14 Tage, als JSON-Item. Daraus eine beobachtete
  effektive Restladezeit ableiten, analog zu `effectiveChargeHours` aus den
  Ladefaktoren.
- Es gilt die groessere der beiden Restladezeiten (Prognose vs.
  Beobachtung), die beobachtete skaliert mit der aktuellen Sonnigkeit
  (PV jetzt geteilt durch Profil-PV jetzt, auf 1 begrenzt). Eine veraltete
  "trueb"-Prognose kann `restH` dann nicht mehr auf 1,3 h druecken, waehrend
  die Anlage 80% ihrer Spitze liefert.
- Sicherheitsnetz unabhaengig davon: vor 12:00, solange PV ueber der
  Haelfte der gelernten PV-Spitze und SoC unter 60% liegt, faellt der
  Sperranteil nie unter 0,3.
- Test gegen den 09-03: pi-118 bleibt bis in den Nachmittag begrenzt.

### A3. Sperre bis zum Vormittags-Crossover der Gemeinschaft (Abweichung 3)

- Server: die Token-API liefert zusaetzlich `crossover_vormittag` fuer
  heute aus dem Prognoselauf (in `getTodayChargeWindow` bereits gerechnet).
  `eeg-api/ladefenster.js` schreibt den Wert in ein neues Item.
- Pi: bis dahin harte Sperre, sofern Kapazitaet x (95% - SoC) / Spitzenrate
  x 1,3 noch in die sonnengewichteten Stunden zwischen Crossover und
  Deadline passt. Passt es nicht, endet die Sperre genau um die fehlende
  Zeit frueher. Danach Regelung wie heute.
- Rueckfall bei fehlendem Item oder falschem Datum: heutiges Verhalten.
- Wirkung auf die Flotte seit 08-31: rund 12 kWh je sonnigem Tag wandern
  vom morgendlichen Laden in den morgendlichen Export, das Laden nimmt der
  Mittagsueberschuss auf.

### A4. Entladeende aus der Prognose, Flottenleistung richtig zaehlen (Abweichung 4)

- Server: `entladeende` in der Token-API, gerechnet wie
  `getTodayDischargeStart`, aber morgens (erster Slot nach 06:00, in dem der
  Ueberschuss der Gemeinschaft das Doppelte der Flotten-Entladeleistung
  uebersteigt). Pi: bei passendem Datum dem Wochen-Crossover vorziehen.
- `getActiveFleetDischargeKw` auf die dynamische Entladeleistung umstellen
  (0,3 C, gekappt bei 5 kW) statt der konfigurierten 3 kW. Heute zaehlt die
  Flotte mit 18 statt rund 24 kW.
- Die Wochen-Crossover-Sicht bleibt Rueckfall; dokumentieren, dass sie
  nach Tag des Jahres ueber alle Jahre mittelt.

### A5. Optional: Nachteinspeisung strecken

Entladeleistung zusaetzlich auf Budget-kWh geteilt durch Stunden bis zum
Vormittags-Crossover, mal 1,2, begrenzen. pi-007 waere dann nicht schon um
23:00 fertig. Niedrige Prioritaet: das Defizit der Gemeinschaft nimmt die
vorgezogene Einspeisung ohnehin auf.

Jeder Schritt in Teil A aktualisiert Whitepaper, Kopfkommentar core.js und
`docs/ibm-setup-vereinfachung.md`; `build-dist.sh` hebt die VERSION, das
Update geht ueber den naechtlichen `ibm-update`-Timer hinaus. Test zuerst im
Vorstandsnetz (Standardablauf).

## Teil B: Server und Datenpipeline

### B1. Prognoselauf taeglich automatisch (Abweichung 2, Server-Seite)

- Neues Verzeichnis `scripts/forecast-run/` mit `forecast-run.sh`,
  systemd-Service und -Timer sowie `install-on-s1.sh` nach dem Muster von
  `scripts/ibm-provision/`.
- Auf s1: Python-3.12-venv mit den Notebook-Abhaengigkeiten (pandas,
  scikit-learn, psycopg, requests), Checkout von `notebooks/forecast/` und
  `notebooks/weather/`, pg-Service `eeg-middleware`.
- Timer taeglich 05:30, nach dem stuendlichen Wetter-Cron der Website und
  bevor die Pis ihr Fenster holen. Befehl wie in CLAUDE.md dokumentiert:

  ```
  python eeg_forecast.py --refresh --days 30 --store
  ```

- Laeufe werden nie ueberschrieben; ein taeglicher Lauf bringt rund 2.900
  Zeilen je Tag. Monatliches Aufraeumen: bewertete Laeufe aelter als ein
  Jahr loeschen.
- Website: `/board/openhab` zeigt das Alter des neuesten Laufs, ab 36 h rot.

### B2. Energiedaten automatisch von EEG-Faktura holen

Ergebnis der Pruefung des Energystore-Quellcodes (Go, AGPL,
github.com/eegfaktura/eegfaktura-energystore):

- Richtiger Endpunkt: `POST https://eegfaktura.at/energystore/query/rawdata`
  mit Basic-Auth (Pruefung gegen Keycloak) und Header `X-Tenant: <RC-Nummer>`.
  Body:

  ```json
  {"ecId": "RC101533", "start": 1756677600000, "end": 1756763999000,
   "cps": [{"meteringPoint": "AT003..."}], "format": "csv"}
  ```

- `start` und `end` sind Unix-**Millisekunden**. Das Spike-Notebook
  `notebooks/eegfaktura/API.ipynb` schickt Sekunden, deshalb kam nie etwas
  zurueck. Leere `cps` = alle aktiven Zaehlpunkte. `format` optional,
  Standard JSON.
- JSON-Antwort: je Zaehlpunkt `{direction, data: [{ts, value[], qov[]}]}`.
  Verbraucher tragen drei Werte je Intervall: Gesamtverbrauch (G.01), Anteil
  gemeinschaftliche Erzeugung (G.02), Eigendeckung (G.03). Erzeuger zwei:
  Gesamte gemeinschaftliche Erzeugung (G.01) und Ueberschuss (P.01). Das
  sind genau die fuenf Meter-Codes in `metering_metercode`. `qov` ist das
  Qualitaetskennzeichen je Wert. Die Slot-Reihenfolge 0, 1, 2 beim ersten
  echten Aufruf gegen einen bekannten Tag in der DB verifizieren.
- `POST /energystore/query/{ecid}/metadata` (gleiche Auth) liefert die
  Zaehlpunktliste mit Namen, Richtung und Zeitraeumen; ersetzt die
  Kopfzeilen des Excel-Reports.
- Der Excel-Report selbst haengt an
  `POST /energystore/eeg/{ecid}/excel/report/download`, dazu gibt es
  `GET /energystore/eeg/{ecid}/lastRecordDate`; beide brauchen ein
  Keycloak-Bearer-Token (Password-Grant, Client-ID nicht oeffentlich).
  Deshalb beim Basic-Auth-Rohdaten-Endpunkt bleiben.
- Im Repo liegen keine EEG-Faktura-Zugangsdaten, das API-Notebook hat keine
  gespeicherte Ausgabe. Schritt null ist ein manueller Aufruf mit
  korrigierten Zeitstempeln.

Umsetzung:

- `notebooks/energyData/eegfaktura_import.py` als CLI, Zugangsdaten aus
  einer gitignorierten `notebooks/.env` (`FAKTURA_USER`, `FAKTURA_PASSWORD`,
  `RC_NUMBER`).
- Fenster: vom letzten vollstaendigen Tag in `metering_measurement` minus
  14 Tage bis gestern, weil Netz OOe spaet und teilweise liefert. Nie mehr
  als drei Monate je Aufruf.
- Zuordnung: Zaehlpunkt ueber `identifier`, Meter-Code ueber `description`,
  genau wie im Excel-Notebook. Schreiben per Upsert auf (Zaehlpunkt, Code,
  Zeitstempel). Vorher pruefen, ob dieser Unique-Constraint im
  Django-Modell existiert; sonst Migration.
- Danach `weekly_metering_summary`, `daily_metering_summary` und
  `daily_metering_quality` aktualisieren, dann den Prognoselauf anstossen.
  Die Teil-Lieferungs-Erkennung der Prognose (`MIN_REPORTING_SHARE`)
  bleibt unveraendert.
- Timer 05:00 auf s1, ein Aufruf je Tag. Das Excel-Notebook bleibt als
  manueller Rueckfall und wird in seiner README so gekennzeichnet.
- Rollout: manuelle Verifikation gegen einen Tag, der schon in der DB liegt
  (exakte Summen je Zaehlpunkt), Probelauf in die Dev-DB, dann Timer auf s1.

### B3. Abweichungen sichtbar machen

Auf `/board/openhab` je Anlage: Uhrzeit, zu der die Batterie heute 95%
erreicht hat; ob die Regelung vor 12:00 aktiv war; Alter der Prognose;
Datum des letzten Imports. Der 09-03 waere damit sofort aufgefallen.

## Teil C: Pis halten ihre Debian-Pakete selbst aktuell

Heute (`04-install-rules.sh`): `apt-daily.timer` aktualisiert die
Paketlisten, `unattended-upgrades` spielt nur das Security-Archiv ein, kein
Reboot, `autoremove` aus. Alles Uebrige zeigt nur das Dashboard, deshalb
stehen auf pi-118 und pi-047 ueber 60 Updates an.

- `04-install-rules.sh` (oder ein neues `11-install-apt-auto.sh`) schreibt
  `/etc/apt/apt.conf.d/52ibm-unattended` mit
  `Unattended-Upgrade::Origins-Pattern` fuer `origin=Debian,codename=${distro_codename}`
  (Hauptarchiv), `...-updates` und `...-security` sowie fuer
  `origin=Raspberry Pi Foundation` (Firmware, Kernel). Das openHAB-Repo
  bleibt ausgenommen: openHAB-Hauptversionen brauchen den Migrationstest
  im Vorstandsnetz, Punkt-Releases kann `ibm-update` spaeter mitnehmen.
- `Unattended-Upgrade::Remove-Unused-Dependencies "true"`,
  `Remove-Unused-Kernel-Packages "true"`, `MinimalSteps "true"`.
- `Unattended-Upgrade::Automatic-Reboot "true"` mit
  `Automatic-Reboot-Time "04:20"` (nach dem `ibm-update`-Nachtfenster
  03:00-05:00 abgestimmt: `ibm-update` haelt an, wenn
  `/run/reboot-required` existiert, und der Reboot liegt nach dem
  Update-Lauf). Zu der Zeit ist keine Ladesperre aktiv und die Entladung
  laeuft ohne Slot weiter, weil jeder Fronius-Schedule nach 5 Minuten
  ohnehin ablaeuft; ein verpasster Slot kostet nichts.
- Timer-Zeit festnageln: `apt-daily-upgrade.timer` per Drop-in auf
  `OnCalendar=*-*-* 03:40` mit `RandomizedDelaySec=20min`, damit Update und
  Reboot nicht mit dem Status-Push und der Regel kollidieren, die um Minute
  2 des 5-Minuten-Rasters voll melden.
- Bestehende Pis: das Paket-Update spielt die Skripte ueber `ibm-update`
  ein; die Konfigurationsdatei wird idempotent ueberschrieben. Beim ersten
  Lauf faellt eine grosse Update-Welle an (60+ Pakete), deshalb an einem
  Tag mit Ansprechpartner ausrollen und die Reboot-Zeiten im Journal
  pruefen.
- Dashboard: der Status-Push meldet bereits `apt_updates.pending`,
  `system.reboot_required` und `security_upgrades_last`. Neu: rote Markierung,
  wenn `pending` an drei Tagen in Folge nicht sinkt oder ein Reboot laenger
  als 48 h aussteht. `purge-ibm.sh` entfernt die neue Konfigurationsdatei
  mit.
- Doku: Abschnitt "Updates" im `setup/README.md` und in
  `docs/ibm-setup-vereinfachung.md`, Hinweis fuer Mitglieder im
  Vorstandsleitfaden (`docs/setup/`), dass der Pi nachts kurz neu startet.

## Reihenfolge, Aufwand, Aufgaben fuer den Vorstand

| Schritt | Inhalt | Aufwand |
|---|---|---|
| B2 Schritt null, B1 | API-Aufruf verifizieren, Prognose-Timer auf s1 | 1-2 Tage |
| A1, A2 | Pi-Paket: Spitzenrate, Live-PV-Boden, Replay-Test | 2-3 Tage |
| B2 | Import-CLI und Timer | 2 Tage |
| C | apt-Automatik in den Setup-Skripten, Rollout | 1 Tag |
| A3, A4 | API-Felder plus Sperre bis Crossover am Pi | 1-2 Tage |
| B3 | Dashboard | 1 Tag |
| A5 | Nacht strecken, optional | halber Tag |

Kein Code, aber Teil von Abweichung 5: Gespraech mit dem Besitzer von
pi-368 (Abschalten am Abend, E-Auto laedt nachts aus der Batterie),
Inbetriebnahme von pi-223 (Sigenergy-Spike-Liste), Hinweis an pi-279, dass
die Reserve von 50% nichts aendert, Fronius-Zugangsdaten auf pi-087 wegen
der fehlgeschlagenen Steuerbefehle pruefen.

Quellen der API-Recherche: github.com/eegfaktura/eegfaktura-energystore
(`rest/restServer.go`, `rest/energy.go`, `store/query_engine.go`,
`store/default_function.go`, `middleware/api_authentication.go`,
`middleware/authentication.go`, `middleware/keycloak.go`,
`excel/EnergyExport.go`, `excel/ExcelSource.go`, `model/counterpoint.go`).
