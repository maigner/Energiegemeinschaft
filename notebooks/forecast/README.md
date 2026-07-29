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

Das Modell entstand, als die Messdaten aus dem monatlichen EEG-Faktura-Export kamen
(`notebooks/energyData/EEG Faktura Energy Report.ipynb`) und der vollständige Datenstand deshalb
drei bis fünf Wochen alt war — autoregressive Lastprognosen (Lags der letzten Stunden/Tage)
schieden damit aus. Seit der neuen Datenanbindung (Juli 2026) ist der Datenstand deutlich
aktueller; der exogene Ansatz bleibt trotzdem, weil er unabhängig vom Import-Rhythmus
funktioniert (ein Lastprofil-Feature aus der jüngsten Historie wäre jetzt aber möglich, siehe
„Grenzen").

Das Modell lernt rein exogen

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
Feiertage, Schulferien in Oberösterreich (näherungsweise gerechnet — die Tourismusregion
verbraucht in den Ferien anders), Jahreszeit (Fourier), Sonnenstand und Clear-Sky-Einstrahlung
(analytisch gerechnet),
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

**2. Unvollständige Lieferungen.** In manchen Lieferungen existieren zwar Zeilen für jeden
Zählpunkt, aber ein großer Teil davon ist über den ganzen Tag 0 (z. B. 2026-01-01 bis 06). Ein
Tag gilt nur als vollständig, wenn mindestens 85 % der vorhandenen Verbrauchs-Zählpunkte eine
Tagessumme > 0 haben; unvollständige Tage fliegen aus Training und Bewertung.
`ef.last_complete_day(frame)` zeigt den echten Datenstand.

Zusätzlich driftet der Verbrauch je Zählpunkt nach oben (neue Mitglieder mit Wärmepumpe/E-Auto:
Juni 2024 4,7 → Juni 2025 7,4 → Juni 2026 8,8 kWh/Zählpunkt/Tag). Deshalb werden ältere Daten
exponentiell abgewertet (Halbwertszeit 120 Tage) und das Niveau am Ende mit einem multiplikativen
Faktor nachkalibriert, der out-of-sample auf den letzten 14 vollständigen Tagen geschätzt wird
(`models[key]["scale"]`; bis `gbt-1.0` waren es 28 Tage — seit die Daten aktuell sind, folgt
das kürzere Fenster Niveauwechseln wie dem Ferienbeginn schneller und halbiert den Bias).
Ohne diese beiden Korrekturen ist die Verbrauchsprognose deutlich schlechter als eine naive
Wochenprofil-Referenz.

## Güte

### Gelieferte Daten gelten als verlässlich

Seit der neuen Datenanbindung (Juli 2026) werden gelieferte Messwerte nicht mehr nachkorrigiert —
die frühere 120-Tage-Reifegrenze (`DATA_MATURITY_DAYS`, `ef.mature_until()`,
`actual_is_mature`) ist entfernt. Backtest, `load_evaluation()` und der Abschnitt
„Wie gut war die Prognose?" auf der Website werten jetzt bis zum letzten vollständig
gelieferten Tag aus. Einzige verbleibende Prüfung ist die Vollständigkeit
(`MIN_REPORTING_SHARE`): Tage, an denen ein großer Teil der Zählpunkte gar nicht geliefert
wurde, fliegen weiterhin aus Training und Bewertung.

Historische Fußnote: unter dem alten EEG-Faktura-Export wurden die letzten rund zwei Monate
noch monatelang nachkorrigiert — Güteaussagen aus der Zeit vor Juli 2026 sind deshalb mit
Vorsicht zu lesen. Sie können in beide Richtungen täuschen: der Februar/März-Vergleich fiel
gegen unkorrigierte Daten zu schlecht aus (18 % statt 6,8 %), die Juli-Überprognose wurde
umgekehrt vorschnell den Daten zugeschrieben, war aber echt (siehe „Praxiswerte").

### Backtest

`ef.backtest()` trainiert rollierend nur auf der Vergangenheit und prognostiziert die folgenden
Tage — genau die Situation im Echtbetrieb. Referenz ist ein naives Wochenprofil (Mittelwert je
Wochentag × Viertelstunde aus den letzten 28 vollständigen Tagen). Normierter mittlerer absoluter
Fehler (nMAE = MAE / Mittelwert), Stand 2026-07-29, Modell `gbt-1.1`:

**6 Folds, Horizont 14 Tage** (Testfenster Mai–Juli 2026):

| Zielgröße | 15 min Modell | 15 min Referenz | Tagessumme Modell | Tagessumme Referenz |
|---|---|---|---|---|
| Verbrauch | 15,2 % | 16,0 % | **9,4 %** | 10,7 % |
| Erzeugung | 26,1 % | 52,9 % | **14,6 %** | 43,8 % |
| Eigendeckung | 27,7 % | 34,7 % | **15,4 %** | 22,4 % |

**4 Folds, Horizont 35 Tage** (Testfenster März–Juli 2026):

| Zielgröße | Tagessumme Modell | Tagessumme Referenz |
|---|---|---|
| Verbrauch | **9,8 %** | 26,3 % |
| Erzeugung | **15,4 %** | 53,1 % |
| Eigendeckung | **17,0 %** | 33,9 % |

Beim Verbrauch ist der Vorsprung auf die naive Referenz auf 14 Tagen klein (im stabilen Sommer
ist ein Wochenprofil stark) und wächst mit dem Horizont; ohne Schulferien-Feature und mit der
alten 28-Tage-Kalibrierung verlor das Modell auf den Sommer-Folds sogar knapp gegen die
Referenz. Die Erzeugungsprozente sind deutlich niedriger als in den früheren Winter-Fenstern —
das ist Saisonalität, keine Modellverbesserung: im Winter ist die Erzeugung winzig und schon
kleine absolute Fehler ergeben riesige Prozentwerte. Backtest nach jedem Import neu laufen
lassen — und beim Vergleich immer mitdenken, welche Jahreszeit die Folds gerade abdecken.

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
zu warten. Diese Läufe bekommen die `model_version` mit Suffix `-hindcast`, weil sie das
tatsächlich eingetretene Wetter verwenden statt der damaligen Wettervorhersage — sie fallen
etwas zu gut aus und sind auf der Website entsprechend gekennzeichnet.

### Praxiswerte

Gespeicherte Läufe gegen die Messwerte, 117 Tage Februar–Juli 2026 (inklusive Hindcast-Läufe),
Stand 2026-07-29:

| Zielgröße | MAE | nMAE | Bias |
|---|---|---|---|
| Verbrauch | 411 kWh | **8,9 %** | +38 kWh |
| Erzeugung | 457 kWh | 14,2 % | +16 kWh |
| Eigendeckung | 242 kWh | 19,7 % | −106 kWh |

**Der Ferieneffekt ist real.** Die echten Live-Läufe von Ende Juli (Modell `gbt-1.0`, 20
Juli-Tage) lagen beim Verbrauch im Schnitt **+543 kWh am Tag zu hoch (18 % nMAE)** — gegen die
neuen, verlässlichen Messwerte gemessen. Die frühere Deutung, die Abweichung sei nur der
unkorrigierte Datenstand gewesen, hat sich damit als zu optimistisch erwiesen: mit Beginn der
Schulferien (Tourismusregion, Betriebsurlaube) sinkt der Verbrauch je Zählpunkt spürbar, und das
rein exogene Modell mit 28-Tage-Niveaukorrektur folgte dem zu langsam. `gbt-1.1` reagiert darauf
mit dem Schulferien-Feature und der auf 14 Tage verkürzten Niveaukorrektur — auf den 2026-Folds
halbiert das den Bias bei gleicher oder besserer Genauigkeit.

Achtung beim Nachrechnen: nMAE (MAE geteilt durch den Mittelwert) und MAPE (Mittel der
Tagesfehler in Prozent) fallen weit auseinander. An Tagen mit sehr wenig Gemeinschaftserzeugung
— im Juli 2026 gab es Tage mit 150 kWh — explodiert MAPE und behauptet 50 % Fehler, wo nMAE 11 %
sagt. `evaluation_summary()` rechnet nMAE.

## Grenzen und mögliche Verbesserungen

* **Wettervorhersage-Fehler** wachsen mit dem Horizont; ab etwa Tag 7 ist die Erzeugungsprognose
  eher „Klimatologie mit Trend" als echte Vorhersage. Das Prognoseband (q10/q90) berücksichtigt
  nur die Streuung des Modells, nicht die Unsicherheit der Wettervorhersage selbst.
* **Ferieneffekte** stecken seit `gbt-1.1` als binäres Schulferien-Feature im Modell (plus die
  schnellere Niveaukorrektur). Das binäre Feature ist grob: An-/Abreisewellen, einzelne
  Ferienwochen mit unterschiedlicher Auslastung oder Betriebsurlaube einzelner großer Verbraucher
  bildet es nicht ab. Der Juli-Fold bleibt mit rund 19 % Verbrauchs-nMAE der schwächste — hier
  ist noch Luft.
* **Kein Lastprofil-Feature aus der jüngsten Historie.** Unter dem alten Export war die Historie
  zum Prognosezeitpunkt Wochen alt; jetzt liegt der letzte vollständige Tag meist nur wenige Tage
  zurück. Ein Wochenprofil der letzten vollständigen Tage als zusätzliches Feature ist damit die
  vielversprechendste nächste Verbesserung — beim Einbau auf den Backtest achten: die Test-Folds
  dürfen nur Historie sehen, die zum jeweiligen Stichtag verfügbar war (Leakage-Gefahr).
  Ein einfacheres Mischen der fertigen Prognose mit dem naiven Wochenprofil wurde auf den
  2026-Folds getestet und **verworfen**: auf 14 Tagen hilft es (≈ 9,3 → 7,8 % nMAE), auf 35
  Tagen schadet es deutlich, weil das Wochenprofil an Saisonübergängen zusammenbricht (im
  April-Fold über 50 % Bias).
* **Zählpunktzahl** wird linear fortgeschrieben. Bei einem Aufnahmestopp oder einer großen
  neuen PV-Anlage `point_counts` in `ef.forecast()` selbst übergeben.
* Die **Niveaukorrektur** (aktuell 1,07 beim Verbrauch) ist ein globaler Faktor. Bei einem
  Saisonwechsel mitten im Kalibrierfenster kann sie danebenliegen — `models[key]["scale"]` im Auge
  behalten, Werte nahe den Grenzen 0,6 / 1,6 sind ein Warnzeichen.
* Prognostiziert wird die **Gemeinschaftssumme**, nicht einzelne Mitglieder. Für einzelne
  Zählpunkte müsste je Punkt (oder je Cluster) trainiert werden — die Struktur des Moduls gibt das
  her, die Normierung entfällt dann.
