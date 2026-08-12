"""Füllt weather_weatherdata lückenlos aus Open-Meteo.

Warum es das Skript gibt
------------------------
Der stündliche Cron der Website (`website/src/lib/server/db/weather/openmeteo.ts`)
schreibt nur ein kleines Fenster um jetzt. Fällt er aus, bleibt die Lücke für
immer -- so ist der komplette Winter 2025/26 verlorengegangen. Dieses Skript
lädt beliebige Zeiträume nach:

* **Archiv-API** (ERA5-Reanalyse) für die Vergangenheit bis vor ~6 Tagen
* **Forecast-API mit `past_days`** für die letzten Tage, die das Archiv noch
  nicht hat, und optional für die Vorhersage

Es schreibt alle Spalten, auch die Strahlungsdaten, die es vorher nicht gab.
Für die Vergangenheit gewinnt das Archiv: eine Reanalyse ist genauer als eine
alte Vorhersage.

Verwendung
----------
    python backfill_openmeteo.py                      # 2024-01-01 bis heute + 16 Tage Vorhersage
    python backfill_openmeteo.py --start 2025-08-01   # nur einen Zeitraum
    python backfill_openmeteo.py --no-forecast        # nur Vergangenheit
    python backfill_openmeteo.py --check              # nur Abdeckung berichten, nichts schreiben
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import psycopg

BASE_DIR = Path(__file__).resolve().parent
NOTEBOOKS_DIR = BASE_DIR.parent

LATITUDE = 47.712596
LONGITUDE = 13.618029
DEFAULT_START = date(2024, 1, 1)

# Spalte in weather_weatherdata -> Open-Meteo Variable
COLUMNS = {
    "temperature_2m": "temperature_2m",
    "cloud_cover": "cloud_cover",
    "rain": "rain",
    "snowfall": "snowfall",
    "snow_depth": "snow_depth",
    "cloud_cover_low": "cloud_cover_low",
    "cloud_cover_mid": "cloud_cover_mid",
    "cloud_cover_high": "cloud_cover_high",
    "relative_humidity_2m": "relative_humidity_2m",
    "dew_point_2m": "dew_point_2m",
    "shortwave_radiation": "shortwave_radiation",
    "direct_radiation": "direct_radiation",
    "diffuse_radiation": "diffuse_radiation",
    "direct_normal_irradiance": "direct_normal_irradiance",
    "sunshine_duration": "sunshine_duration",
    "wind_speed_10m": "wind_speed_10m",
    "precipitation": "precipitation",
    "apparent_temperature": "apparent_temperature",
    "snow_depth_water_equivalent": "snow_depth_water_equivalent",
}

# NOT NULL in der Tabelle -- Stunden ohne diese Werte werden übersprungen
REQUIRED = [
    "temperature_2m",
    "cloud_cover",
    "rain",
    "snowfall",
    "snow_depth",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "relative_humidity_2m",
    "dew_point_2m",
]


def connect():
    # nur setzen, wenn die Dateien wirklich im Repo liegen -- sonst nimmt
    # libpq die Standardorte ~/.pg_service.conf und ~/.pgpass
    if (NOTEBOOKS_DIR / ".pg_service.conf").exists():
        os.environ.setdefault("PGSERVICEFILE", str(NOTEBOOKS_DIR / ".pg_service.conf"))
    if (NOTEBOOKS_DIR / ".pgpass").exists():
        os.environ.setdefault("PGPASSFILE", str(NOTEBOOKS_DIR / ".pgpass"))
    return psycopg.connect(service="eeg-middleware")


def fetch(url: str, params: dict, variables: list[str]) -> list[dict]:
    """Eine Open-Meteo Antwort in Zeilen (dict je Stunde) umwandeln."""
    params = {**params, "latitude": LATITUDE, "longitude": LONGITUDE,
              "timezone": "UTC", "hourly": ",".join(variables)}
    query = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{url}?{query}", timeout=120) as response:
        payload = json.load(response)

    hourly = payload["hourly"]
    rows = []
    for i, timestamp in enumerate(hourly["time"]):
        row = {"time": f"{timestamp}:00+00:00" if len(timestamp) == 16 else timestamp}
        for column, variable in COLUMNS.items():
            values = hourly.get(variable)
            row[column] = values[i] if values is not None else None
        rows.append(row)
    return rows


def fetch_archive(start: date, end: date) -> list[dict]:
    if start > end:
        return []
    # snow_depth_water_equivalent gibt es im ERA5-Archiv nicht
    variables = [v for v in COLUMNS.values() if v != "snow_depth_water_equivalent"]
    return fetch(
        "https://archive-api.open-meteo.com/v1/archive",
        {"start_date": str(start), "end_date": str(end)},
        variables,
    )


def fetch_recent(past_days: int, forecast_days: int) -> list[dict]:
    return fetch(
        "https://api.open-meteo.com/v1/forecast",
        {"past_days": min(past_days, 92), "forecast_days": forecast_days},
        list(COLUMNS.values()),
    )


def upsert(rows: list[dict], label: str) -> tuple[int, int]:
    """Zeilen schreiben; unvollständige Stunden (NULL in Pflichtspalten) auslassen."""
    usable = [r for r in rows if all(r.get(c) is not None for c in REQUIRED)]
    skipped = len(rows) - len(usable)
    if not usable:
        print(f"[{label}] nichts zu schreiben ({skipped} unvollständige Stunden)")
        return 0, skipped

    columns = ["time", *COLUMNS]
    placeholders = ", ".join(["%s"] * len(columns))
    updates = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in COLUMNS)
    sql = (
        f'INSERT INTO weather_weatherdata ({", ".join(chr(34) + c + chr(34) for c in columns)}) '
        f"VALUES ({placeholders}) "
        f"ON CONFLICT (time) DO UPDATE SET {updates}"
    )
    values = [tuple(row[c] for c in columns) for row in usable]

    with connect() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, values)
        conn.commit()
    print(f"[{label}] {len(usable)} Stunden geschrieben, {skipped} unvollständige übersprungen")
    return len(usable), skipped


def report_coverage() -> None:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select to_char(date_trunc('month', time), 'YYYY-MM') as month,
                       count(*) as rows,
                       count(*) filter (where shortwave_radiation is not null) as with_radiation,
                       count(*) filter (where temperature_2m = 'NaN') as nan_rows
                from weather_weatherdata
                group by 1 order by 1
                """
            )
            months = cur.fetchall()

    print(f"\n{'Monat':10s} {'Stunden':>8s} {'davon Strahlung':>16s} {'NaN':>5s}   Lücke")
    previous = None
    for month, rows, radiation, nan_rows in months:
        year, mon = int(month[:4]), int(month[5:])
        expected = (date(year + mon // 12, mon % 12 + 1, 1) - date(year, mon, 1)).days * 24
        gap = "" if rows >= expected - 1 else f"fehlen {expected - rows} h"
        if previous and (year * 12 + mon) - previous > 1:
            print(f"{'':10s} {'':>8s} {'':>16s} {'':>5s}   >>> ganze Monate fehlen <<<")
        previous = year * 12 + mon
        print(f"{month:10s} {rows:8d} {radiation:16d} {nan_rows:5d}   {gap}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Open-Meteo Backfill für weather_weatherdata")
    parser.add_argument("--start", default=str(DEFAULT_START), help="Startdatum (YYYY-MM-DD)")
    parser.add_argument("--end", default=None, help="Enddatum der Historie (Default: heute)")
    parser.add_argument("--forecast-days", type=int, default=16)
    parser.add_argument("--no-forecast", action="store_true", help="nur Vergangenheit laden")
    parser.add_argument("--chunk-days", type=int, default=180, help="Blockgröße der Archiv-Abfragen")
    parser.add_argument("--check", action="store_true", help="nur Abdeckung berichten")
    args = parser.parse_args()

    if args.check:
        report_coverage()
        return

    backfill(
        start=date.fromisoformat(args.start),
        end=date.fromisoformat(args.end) if args.end else None,
        forecast_days=1 if args.no_forecast else args.forecast_days,
        chunk_days=args.chunk_days,
    )
    report_coverage()


def backfill(start: date = DEFAULT_START, end: date | None = None,
             forecast_days: int = 16, chunk_days: int = 180) -> int:
    """Zeitraum nachladen; gibt die Anzahl geschriebener Stunden zurück.

    Auch aus Notebooks heraus verwendbar:

        import backfill_openmeteo as weather
        weather.backfill()
        weather.report_coverage()
    """
    today = date.today()
    end = end or today
    # das ERA5-Archiv hinkt rund fünf Tage nach
    archive_end = min(end, today - timedelta(days=6))

    written = 0
    chunk_start = start
    while chunk_start <= archive_end:
        chunk_end = min(chunk_start + timedelta(days=chunk_days - 1), archive_end)
        rows = fetch_archive(chunk_start, chunk_end)
        written += upsert(rows, f"Archiv {chunk_start}..{chunk_end}")[0]
        chunk_start = chunk_end + timedelta(days=1)

    # letzte Tage + Vorhersage aus der Forecast-API
    past_days = max((today - archive_end).days + 1, 2) if end >= archive_end else 2
    rows = fetch_recent(past_days, forecast_days)
    written += upsert(rows, f"Forecast-API (letzte {past_days} Tage + {forecast_days} Tage voraus)")[0]

    print(f"\ngesamt {written} Stunden geschrieben")
    return written


if __name__ == "__main__":
    main()
