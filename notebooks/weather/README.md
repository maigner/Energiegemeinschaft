# Wetterdaten

Quelle: https://open-meteo.com — Standort Bad Ischl, LAT `47.712596`, LON `13.618029`, stündlich.

Ziel ist die Tabelle `weather_weatherdata` (Django-Modell `middleware/eeg/weather/models.py`).

## Wer schreibt was

| Was | Wo | Zeitraum |
|---|---|---|
| Laufender Betrieb | `website/src/lib/server/db/weather/openmeteo.ts`, stündlicher Cron | letzte 7 Tage + 16 Tage Vorhersage |
| Nachladen / Lücken füllen | [`backfill_openmeteo.py`](backfill_openmeteo.py) | beliebig, ab 2024-01-01 |

```bash
../../.venv/bin/python backfill_openmeteo.py --check          # Abdeckung prüfen, nichts schreiben
../../.venv/bin/python backfill_openmeteo.py                  # 2024-01-01 bis heute + Vorhersage
../../.venv/bin/python backfill_openmeteo.py --start 2025-08-01
```

Der Cron holt zwei Modelle: `best_match` (16 Tage, alle Variablen) und darüber `geosphere_arome_austria`
(hochauflösend, aber nur ~3 Tage und ohne Schneehöhe) — AROME aktualisiert nur bereits vorhandene
Zeilen und nur dort, wo es tatsächlich Werte liefert. `past_days: 7` sorgt dafür, dass ein
ausgefallener Lauf beim nächsten Mal von selbst nachgeholt wird.

Das Backfill-Skript nimmt für die Vergangenheit die **Archiv-API** (ERA5-Reanalyse, genauer als eine
alte Vorhersage) und für die letzten ~6 Tage, die das Archiv noch nicht hat, die Forecast-API mit
`past_days`. Es lohnt sich, es gelegentlich (z. B. monatlich, nach dem EEG-Faktura-Import) laufen
zu lassen: dann werden die Tage, die der Cron als Vorhersage geschrieben hat, durch die Reanalyse
ersetzt — und `--check` zeigt sofort, wenn der Cron zwischendurch ausgefallen ist.

## Strahlungsdaten

Seit Migration `weather.0006` stehen zusätzlich `shortwave_radiation`, `direct_radiation`,
`diffuse_radiation`, `direct_normal_irradiance`, `sunshine_duration`, `wind_speed_10m`,
`precipitation`, `apparent_temperature` und `snow_depth_water_equivalent` in der Tabelle. Die
Globalstrahlung ist die mit Abstand wichtigste Größe für die Erzeugungsprognose (rund 80 % der
Modellwichtigkeit, siehe `notebooks/forecast/README.md`) — Bewölkung ist dafür kein Ersatz.

`snow_depth` ist die Schneehöhe in m, `snow_depth_water_equivalent` das Wasseräquivalent in mm.
AROME liefert nur letzteres; die beiden dürfen nicht in dieselbe Spalte.

## Die alten Notebooks

`load open meteo.ipynb` und `load open meteo historic.ipynb` schreiben nur die ursprünglichen elf
Spalten und lassen die Strahlungsdaten leer. Sie sind durch `backfill_openmeteo.py` abgelöst —
für neue Ladevorgänge das Skript verwenden.

CSV-Beispiel der Rohdaten:

```
time,temperature_2m (°C),cloud_cover (%),direct_radiation (W/m²),rain (mm),snowfall (cm),cloud_cover_low (%),cloud_cover_mid (%),cloud_cover_high (%)
2024-01-01T00:00,3.5,100,0.0,0.20,1.05,100,100,77
2024-01-01T01:00,2.7,100,0.0,0.10,0.98,100,100,98
```
