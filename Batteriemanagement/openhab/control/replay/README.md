# Replay der Batteriesteuerung

Laesst `control/core.js` ausserhalb von openHAB gegen die Status-Historie der
Anlagen laufen (5-Minuten-Raster, `members_openhabstatushistory`) und
simuliert dabei den Ladestand: Was haette die Steuerung an jedem Tag
gemacht, und waere die Batterie zur Abend-Deadline voll geworden? Damit
wurden am 2026-09-06 die Spitzen-Ladeleistung, das Sonnenprofil, die
Sperre bis zum Vormittags-Crossover und die Kalibrierung (Sicherheitsfaktor
1,5, Deadline zwei Stunden vor dem Abend-Crossover) geprueft.

## Daten holen

Braucht `psql service=eeg-middleware` (Produktions-DB, nur lesen):

```
./export-data.sh
```

schreibt `history.csv` (30 Tage Status je Anlage), `forecast_days.csv`
(Prognose-Slots je Tag, jeweils der Lauf, den der Pi an dem Tag hatte) und
`clouds.csv` (stuendliche Bewoelkung). Die Dateien enthalten Betriebsdaten
der Mitglieder und sind gitignored.

## Laufen lassen

```
node replay.js ../core.js --from 2026-08-26 --to 2026-09-05
node replay.js ../core.js --plant 4 --verbose 2026-09-04      # jeden Zyklus mit Log
node replay.js core_old.js --old-rate                          # alter Stand als Vergleich
```

Je Anlage und Tag: Uhrzeit, zu der der simulierte Ladestand 95% erreicht
(mit `!`, wenn nach der Deadline), Energie morgens vor dem
Vormittags-Crossover in die Batterie und ins Netz, dasselbe fuer den ganzen
Tag, gesperrte Slots und mittlerer Sperranteil. `--csv datei` schreibt jeden
Tageszyklus. `--no-crossover` schaltet die neuen Server-Signale
(Entladeende, Vormittags-Crossover) ab, `--old-rate` setzt die gelernte
Ladeleistung aus der Historie vor (fuer den alten Kern; der neue verwirft
sie beim ersten Lauf).

## Was simuliert wird

- Ab 05:00 startet der simulierte Ladestand mit dem echten Wert des Tages.
  Die "potenzielle Ladeleistung" eines Slots ist, was die Batterie frei
  laden koennte: beobachtete Ladung plus beobachteter Export (also PV minus
  Hauslast), gekappt beim 95. Perzentil der beobachteten Ladeleistung.
  Gesperrte Slots laden nichts, freie Slots das Potenzial; Leistungslimits
  (`ibmLimitCharge`) werden nicht simuliert.
- Die Batterieleistung, die der Kern liest, ist tagsueber die simulierte
  Ladung des vorigen Slots (so lernt der Schaetzer aus der Simulation).
  Nachts laufen die echten Werte durch; die Kapazitaet wird auf dem Wert
  aus der Historie festgehalten, damit die Nacht-Simulation sie nicht
  verstellt.
- Ladefaktoren, Entladestart/-ende und Vormittags-Crossover werden aus den
  Prognose-Slots gerechnet wie auf dem Server (`forecast.ts`), die
  Wolkenstunden aus den Wetterdaten; die Wochen-Crossover und die
  Mittags-Wolkenvorschau kommen aus der Historie.
- `time`, `items` und die Adapterfunktionen sind Attrappen
  (`ibmPreventCharge` und `ibmForceDischarge` werden nur protokolliert).
  Europe/Vienna wird als UTC behandelt, das Replay kennt keine
  Zeitumstellung.

Grenzen: offene Schleife fuer alles, was nicht der Ladestand ist (die
Gemeinschaftsprognose und das Wetter bleiben, wie sie waren), keine
Wechselrichter-Quantisierung, und der Tag endet in der Simulation um
21:00.
