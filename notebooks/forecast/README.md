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
../../.venv/bin/python eeg_forecast.py --backtest --folds 6           # Gütebewertung
```

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

`ef.backtest()` trainiert rollierend nur auf der Vergangenheit und prognostiziert die folgenden
14 Tage — genau die Situation im Echtbetrieb. Referenz ist ein naives Wochenprofil (Mittelwert je
Wochentag × Viertelstunde aus den letzten 28 vollständigen Tagen).

Normierter mittlerer absoluter Fehler (nMAE = MAE / Mittelwert), Mittel über 6 Folds,
Horizont 14 Tage (Stand 2026-07-28, Folds von April bis Juli 2026):

| Zielgröße | 15 min Modell | 15 min Referenz | Tagessumme Modell | Tagessumme Referenz |
|---|---|---|---|---|
| Verbrauch | 13 % | 26 % | **6,5 %** | 22 % |
| Erzeugung | 23 % | 57 % | **14 %** | 49 % |
| Eigendeckung | 26 % | 38 % | **14 %** | 27 % |

Im Echtbetrieb liegt der erste Prognosetag schon drei Wochen hinter dem letzten vollständigen Tag.
Mit Horizont 35 Tagen (4 Folds, Februar bis Juni 2026) sieht es so aus:

| Zielgröße | Tagessumme Modell | Tagessumme Referenz |
|---|---|---|
| Verbrauch | 9,5 % | 29 % |
| Erzeugung | 16 % | 63 % |
| Eigendeckung | 19 % | 44 % |

Die Erzeugung ist der große Gewinn: sie hängt fast vollständig am Wetter, das ein Wochenprofil gar
nicht kennen kann. Beim Verbrauch ist der Vorsprung im Jahresverlauf groß (die Referenz kommt bei
Temperaturwechseln nicht mit), in einer stabilen Sommerphase dagegen klein — im Juni-Fold war die
naive Referenz beim Verbrauch sogar besser (11,5 % vs. 15,8 %).

Backtest nach jedem Import neu laufen lassen — die Zahlen hängen davon ab, welche Jahreszeit die
Folds abdecken.

## Grenzen und mögliche Verbesserungen

* **Wettervorhersage-Fehler** wachsen mit dem Horizont; ab etwa Tag 7 ist die Erzeugungsprognose
  eher „Klimatologie mit Trend" als echte Vorhersage. Das Prognoseband (q10/q90) berücksichtigt
  nur die Streuung des Modells, nicht die Unsicherheit der Wettervorhersage selbst.
* **Urlaubs- und Ferieneffekte** (Tourismusregion, Betriebsurlaube) sind nicht modelliert.
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
