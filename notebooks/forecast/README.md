# Energieprognose

Prognose der Gemeinschafts-Energiedaten (15-Minuten-Auflösung) für die Tage, die der
EEG-Faktura-Export noch nicht abdeckt — heute und die nächsten ein bis zwei Wochen.

* [`Energieprognose.ipynb`](Energieprognose.ipynb) — Bedienung: laden, bewerten, prognostizieren, exportieren
* [`eeg_forecast.py`](eeg_forecast.py) — die gesamte Logik (auch als CLI verwendbar)
* `cache/` — lokale Kopien der DB-Abfragen, der Wetterdaten und der Prognose-CSVs (gitignored)

## Schnellstart

```bash
cd notebooks/forecast
../../.venv/bin/python eeg_forecast.py --refresh --days 14            # Prognose als CSV + Tagestabelle
../../.venv/bin/python eeg_forecast.py --refresh --days 30 --store    # dasselbe, zusätzlich in die DB
../../.venv/bin/python eeg_forecast.py --backtest --folds 6           # Gütebewertung
../../.venv/bin/python eeg_forecast.py --evaluate                     # gespeicherte Prognosen vs. Messdaten
```

**Nach jedem EEG-Faktura-Import:** erst das Import-Notebook laufen lassen (es
aktualisiert auch `daily_metering_quality`), dann
`eeg_forecast.py --refresh --days 30 --store`. Die Website zeigt automatisch den
neuesten gespeicherten Lauf unter `/vorhersage`.

Im Notebook:

```python
import eeg_forecast as ef
frame  = ef.build_frame(refresh=True)     # DB + Open-Meteo
models = ef.train(frame)
fc     = ef.forecast(frame, models, days=14)
ef.daily_summary(fc)
```

`refresh=True` nach jedem neuen EEG-Faktura-Import setzen — sonst werden die Dateien in `cache/`
verwendet (die Wettervorhersage wird trotzdem alle 3 Stunden neu geholt).

## Ansatz

Die Messdaten stammen aus dem monatlichen EEG-Faktura-Export
(`notebooks/energyData/EEG Faktura Energy Report.ipynb`), der vollständige Datenstand ist deshalb
drei bis fünf Wochen alt. Autoregressive Lastprognosen (Lags der letzten Stunden/Tage) scheiden
damit aus — zum Prognosezeitpunkt gibt es keine aktuelle Historie.

Das Modell lernt stattdessen rein exogen

> (Kalender, Sonnenstand, Wetter) → Energie **je aktivem Zählpunkt** je Viertelstunde

und wendet das auf die Wettervorhersage an. Verfahren: Gradient Boosting
(`HistGradientBoostingRegressor`), je Zielgröße ein Punktmodell plus 10-%- und 90-%-Quantilmodell
für das Prognoseband.

**Zielgrößen.** Die Meter Codes hängen zusammen (an den Gemeinschaftssummen geprüft):

```
Anteil gemeinschaftliche Erzeugung  ==  Gesamte gemeinschaftliche Erzeugung
Anteil                              ==  Eigendeckung + Gemeinschaftsüberschuss
```

Der „Anteil" ist also dieselbe Energie wie die Erzeugung, nur auf der Verbraucherseite nach
Aufteilungsschlüssel gezählt — nicht das, was die Mitglieder tatsächlich genutzt haben. Das ist die
**Eigendeckung**. Daraus ergeben sich drei Modelle plus eine abgeleitete Größe:

| Key | Meter Code | Normierung |
|---|---|---|
| `consumption` | Gesamtverbrauch lt. Messung | Verbrauchs-Zählpunkte |
| `generation` | Gesamte gemeinschaftliche Erzeugung | Erzeuger-Zählpunkte |
| `self_coverage` | Eigendeckung gemeinschaftliche Erzeugung | Verbrauchs-Zählpunkte |
| `surplus` | abgeleitet: `generation − self_coverage` | — |

Weil die drei Modelle unabhängig geschätzt werden, wird die Eigendeckung anschließend auf
`min(Verbrauch, Erzeugung)` begrenzt und der Überschuss daraus gerechnet — so stimmt die
Energiebilanz der Prognose in sich. Der Deckungsgrad (`coverage_pct`) ist
Eigendeckung / Verbrauch, historisch ≈ 2,5 % im Dezember und ≈ 46 % im Juni.

**Features:** Viertelstunde des Tages (+ Fourier-Terme), Wochentag, Wochenende, österreichische
Feiertage, Jahreszeit (Fourier), Sonnenstand und Clear-Sky-Einstrahlung (analytisch gerechnet),
Wetter von Open-Meteo (Temperatur, Taupunkt, Luftfeuchte, Bewölkung in drei Schichten, Regen,
Schneefall, Schneedecke, Wind, Global-/Direkt-/Diffusstrahlung, Sonnenscheindauer) sowie abgeleitete
Größen (Clear-Sky-Index, 24-h-Temperaturmittel/-min/-max, Heiz-/Kühlgradtage, Strahlungsmittel).

Wetter kommt direkt von Open-Meteo, nicht aus `weather_weatherdata`: Archiv-API für die Historie,
Forecast-API für die nächsten 16 Tage. Die Tabelle enthält seit Migration `weather.0006` zwar
dieselben Größen inklusive Strahlung (siehe `notebooks/weather/README.md`), das Modell bleibt aber
absichtlich unabhängig davon — es funktioniert auch, wenn der stündliche Cron der Website ausfällt.
Die Tabelle wird von hier weder gelesen noch geschrieben.

## Zwei Dinge, die den Ausschlag geben

**1. Normierung je Zählpunkt.** Die Gemeinschaft ist von 4 auf über 420 Zählpunkte gewachsen —
absolute Summen werden vom Mitgliederwachstum dominiert, nicht vom Wetter. Trainiert wird deshalb
auf dem Mittelwert je aktivem Zählpunkt; die Prognose wird mit der fortgeschriebenen Zählpunktzahl
(linearer Trend der letzten 120 vollständigen Tage, nie unter dem letzten Stand) hochskaliert.

**2. Unvollständige Lieferungen.** In manchen Exporten existieren zwar Zeilen für jeden Zählpunkt,
aber ein großer Teil davon ist über den ganzen Tag 0 (z. B. 2026-01-01 bis 06 und alles nach
2026-07-06). Ein Tag gilt nur als vollständig, wenn mindestens 85 % der vorhandenen
Verbrauchs-Zählpunkte eine Tagessumme > 0 haben; unvollständige Tage fliegen aus Training und
Bewertung. `ef.last_complete_day(frame)` zeigt den echten Datenstand.

Zusätzlich driftet der Verbrauch je Zählpunkt nach oben (neue Mitglieder mit Wärmepumpe/E-Auto:
Juni 2024 4,7 → Juni 2025 7,4 → Juni 2026 8,8 kWh/Zählpunkt/Tag). Deshalb werden ältere Daten
exponentiell abgewertet (Halbwertszeit 120 Tage) und das Niveau am Ende mit einem multiplikativen
Faktor nachkalibriert, der out-of-sample auf den letzten 28 vollständigen Tagen geschätzt wird
(`models[key]["scale"]`). Ohne diese beiden Korrekturen ist die Verbrauchsprognose deutlich
schlechter als eine naive Wochenprofil-Referenz.

## Güte

### Nur gesicherte Daten sind ein Maßstab

Die EEG-Faktura-Daten ändern sich noch monatelang: **die letzten rund zwei Monate sind
unvollständig oder schlicht falsch, erst ab drei bis vier Monaten gelten sie als endgültig.**
Die Vollständigkeitsprüfung (`MIN_REPORTING_SHARE`) erwischt nur die offensichtlich lückenhaften
Lieferungen, nicht die Werte, die vollständig aussehen und später korrigiert werden.

Alles, was Prognosegüte misst, ist deshalb auf Tage vor `ef.mature_until()` beschränkt
(`DATA_MATURITY_DAYS = 120`): der Backtest, `load_evaluation()` und der Abschnitt
„Wie gut war die Prognose?" auf der Website. Sonst misst man Datenfehler und nennt sie
Prognosefehler — der Unterschied ist erheblich, siehe „Praxiswerte" unten.

**Das Training verwendet die jungen Daten weiterhin**, denn nur sie tragen das aktuelle Niveau.
Das ist eine bewusste Abwägung, keine Nachlässigkeit — siehe „Grenzen".

### Backtest

`ef.backtest()` trainiert rollierend nur auf der Vergangenheit und prognostiziert die folgenden
Tage — genau die Situation im Echtbetrieb. Referenz ist ein naives Wochenprofil (Mittelwert je
Wochentag × Viertelstunde aus den letzten 28 vollständigen Tagen). Normierter mittlerer absoluter
Fehler (nMAE = MAE / Mittelwert), Stand 2026-07-28:

**6 Folds, Horizont 14 Tage** (Testfenster Januar–März 2026):

| Zielgröße | 15 min Modell | 15 min Referenz | Tagessumme Modell | Tagessumme Referenz |
|---|---|---|---|---|
| Verbrauch | 11,4 % | 25,7 % | **7,1 %** | 23,4 % |
| Erzeugung | 55,3 % | 101,2 % | **47,1 %** | 95,3 % |
| Eigendeckung | 62,2 % | 97,9 % | **54,2 %** | 92,0 % |

**4 Folds, Horizont 35 Tage** (Testfenster November 2025–Februar 2026) — realistischer, weil der
erste Prognosetag im Echtbetrieb schon Wochen hinter dem letzten gesicherten Tag liegt:

| Zielgröße | Tagessumme Modell | Tagessumme Referenz |
|---|---|---|
| Verbrauch | **6,9 %** | 28,0 % |
| Erzeugung | **37,5 %** | 119,6 % |
| Eigendeckung | **46,7 %** | 107,6 % |

**Die Erzeugungsprozente nicht mit früheren Sommerzahlen vergleichen.** Durch die Reifegrenze
liegen die Testfenster jetzt im Winter, und da ist die gemeinschaftliche Erzeugung winzig — im
Dezember rund 200 kWh am Tag gegenüber 7.000 kWh im Juni. Ein absolut kleiner Fehler ergibt dann
einen riesigen Prozentwert; die naive Referenz liegt im selben Fenster bei über 100 %. In
absoluten Zahlen (Soll-Ist-Vergleich Februar/März 2026): Erzeugung 297 kWh Fehler am Tag,
Verbrauch 407 kWh.

Backtest nach jedem Import neu laufen lassen — und beim Vergleich immer mitdenken, welche
Jahreszeit die Folds gerade abdecken.

## Speicherung und Soll-Ist-Vergleich

`--store` schreibt einen Lauf in `metering_energyforecastrun` (Metadaten: Zeitpunkt,
Datenstand, Horizont, Hyperparameter, Niveaukorrekturen) und die 15-Minuten-Werte in
`metering_energyforecast`. **Läufe werden nie überschrieben** — nur so lässt sich später
nachvollziehen, was die Prognose gesagt hat, bevor die echten Daten da waren.

Sobald der EEG-Faktura-Export die betreffenden Tage nachliefert, stellt die View
`energy_forecast_vs_actual` beides gegenüber (siehe `middleware/README.md`). Unvollständig
gelieferte Tage sind dort über `actual_is_complete` ausgeschlossen — sie sähen sonst wie ein
riesiger Prognosefehler aus. In Python:

```python
evaluation = ef.load_evaluation()          # je Lauf und Tag: Prognose, Messwert, Abweichung
ef.evaluation_summary(evaluation)          # MAE / nMAE / Bias je Zielgröße
```

`--hindcast N` rechnet zusätzlich N Läufe für bereits vergangene Zeiträume nach (trainiert nur
mit Daten vor dem jeweiligen Stichtag). Damit hat der Vergleich sofort Inhalt, ohne einen Monat
zu warten. Diese Läufe bekommen die `model_version` `gbt-1.0-hindcast`, weil sie das tatsächlich
eingetretene Wetter verwenden statt der damaligen Wettervorhersage — sie fallen etwas zu gut aus
und sind auf der Website entsprechend gekennzeichnet.

### Praxiswerte

Gespeicherte Läufe gegen endgültige Messwerte, 55 Tage im Februar/März 2026, Horizont 1–14 Tage:

| Zielgröße | MAE | nMAE | Bias |
|---|---|---|---|
| Verbrauch | 407 kWh | **6,8 %** | −23 kWh |
| Erzeugung | 297 kWh | 24,5 % | −69 kWh |
| Eigendeckung | 202 kWh | 27,3 % | −139 kWh |

Der Verbrauch trifft gut und praktisch ohne systematische Verzerrung. Die Erzeugungsprozente sind
wieder der Winter-Effekt aus dem vorigen Abschnitt.

**Warum diese Zahlen nicht früher da waren:** ein erster Vergleich gegen die *jüngsten* Messwerte
hatte für den Verbrauch 18 % Abweichung ergeben, mit einem scheinbar klaren Muster — ab Tag 13
lag die Prognose systematisch rund 1.000 kWh zu hoch. Die Erklärung schien der Ferieneffekt Ende
Juli zu sein. Gegen gesicherte Daten gemessen bleibt davon nichts übrig: dort sind es 6,8 % ohne
nennenswerten Bias. Die vermeintliche Prognoseabweichung war zum Großteil der noch nicht
korrigierte Datenstand. Ob es einen Ferieneffekt gibt, lässt sich erst im Herbst beurteilen, wenn
der Juli 2026 als gesichert gilt.

Achtung beim Nachrechnen: nMAE (MAE geteilt durch den Mittelwert) und MAPE (Mittel der
Tagesfehler in Prozent) fallen weit auseinander. An Tagen mit sehr wenig Gemeinschaftserzeugung
— im Juli 2026 gab es Tage mit 150 kWh — explodiert MAPE und behauptet 50 % Fehler, wo nMAE 11 %
sagt. `evaluation_summary()` rechnet nMAE.

## Grenzen und mögliche Verbesserungen

* **Wettervorhersage-Fehler** wachsen mit dem Horizont; ab etwa Tag 7 ist die Erzeugungsprognose
  eher „Klimatologie mit Trend" als echte Vorhersage. Das Prognoseband (q10/q90) berücksichtigt
  nur die Streuung des Modells, nicht die Unsicherheit der Wettervorhersage selbst.
* **Urlaubs- und Ferieneffekte** (Tourismusregion, Betriebsurlaube) sind nicht modelliert. Ob sie
  überhaupt ins Gewicht fallen, lässt sich erst sagen, wenn ein Sommer als gesichert gilt.
* **Trainiert wird auch auf den jungen, noch nicht endgültigen Daten** — bewusst, weil nur sie das
  aktuelle Niveau tragen. Besonders betrifft das die Niveaukorrektur, die auf den letzten 28
  vollständigen Tagen geschätzt wird, also mitten im unsicheren Bereich. Alternativen wären, die
  Korrektur auf gesicherte Tage zu stützen (aktueller, aber veraltetes Niveau) oder ganz ohne
  junge Daten zu trainieren (sauber, aber blind für den aktuellen Stand). Solange die
  Praxiswerte auf gesicherten Daten gut aussehen, bleibt es bei der jetzigen Abwägung.
* **Kein Lastprofil-Feature aus der jüngsten Historie.** Ein um ~45 Tage verzögertes Wochenprofil
  als zusätzliches Feature würde den Verbrauch vermutlich weiter verbessern.
* **Zählpunktzahl** wird linear fortgeschrieben. Bei einem Aufnahmestopp oder einer großen
  neuen PV-Anlage `point_counts` in `ef.forecast()` selbst übergeben.
* Die **Niveaukorrektur** (aktuell 1,32 beim Verbrauch) ist ein globaler Faktor. Bei einem
  Saisonwechsel mitten im Kalibrierfenster kann sie danebenliegen — `models[key]["scale"]` im Auge
  behalten, Werte nahe den Grenzen 0,6 / 1,6 sind ein Warnzeichen.
* Prognostiziert wird die **Gemeinschaftssumme**, nicht einzelne Mitglieder. Für einzelne
  Zählpunkte müsste je Punkt (oder je Cluster) trainiert werden — die Struktur des Moduls gibt das
  her, die Normierung entfällt dann.
