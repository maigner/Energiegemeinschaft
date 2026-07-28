"""Energieprognose für die Energiegemeinschaft ischlstrom.

Forecasts the community energy time series (15 min resolution) for the days that
are not yet covered by the EEG-Faktura export -- typically "today" and the next
one to two weeks.

Why a purely exogenous model
----------------------------
The measurement data in `metering_measurement` is loaded from the monthly
EEG-Faktura energy report, so the newest complete day is usually three to five
weeks in the past.  A classic autoregressive load forecast (lags of the last
hours/days) is therefore useless here: at prediction time there is no recent
history at all.  The model instead learns a mapping

    (calendar features, solar geometry, weather) -> energy per measurement point

from ~2 years of history, and applies it to the weather *forecast* of the days
we want to predict.  Weather comes from Open-Meteo (archive API for the past,
forecast API for the next 16 days) -- the same source the `weather/` notebooks
already use.

Why "per measurement point"
---------------------------
The community grew from 4 to >420 measurement points, so absolute community
totals are dominated by member growth, not by weather or season.  All models are
therefore trained on the *average per active measurement point* and the
prediction is scaled back up with the projected number of points.

Data quality
------------
Some exports are only partially delivered: the rows exist for every point, but a
large share of the points is all-zero for those days (e.g. 2026-01-01..06 and
everything after 2026-07-06).  Such days are detected via the share of points
with a non-zero daily sum and excluded from training and evaluation.

Usage
-----
    python eeg_forecast.py --refresh          # reload from DB + Open-Meteo, forecast, write CSV
    python eeg_forecast.py --days 14 --backtest

or from a notebook:

    import eeg_forecast as ef
    frame  = ef.build_frame()
    models = ef.train(frame)
    fc     = ef.forecast(frame, models, days=14)
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

BASE_DIR = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)

# Bad Ischl / Sankt Wolfgang area -- same coordinates as notebooks/weather
LATITUDE = 47.712596
LONGITUDE = 13.618029
TZ = "Europe/Vienna"
FREQ = "15min"

PG_SERVICE = "eeg-middleware"
NOTEBOOKS_DIR = BASE_DIR.parent

# meter codes as they are stored in metering_metercode.description
CODE_CONSUMPTION = "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)"
CODE_ALLOCATED = "Anteil gemeinschaftliche Erzeugung"
CODE_SELF_COVERAGE = "Eigendeckung gemeinschaftliche Erzeugung"
CODE_GENERATION = "Gesamte gemeinschaftliche Erzeugung"
CODE_SURPLUS = "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss"


@dataclass(frozen=True)
class Target:
    """One forecastable series."""

    key: str  # column prefix used everywhere
    code: str  # meter code description in the DB
    label: str  # German label for plots/reports
    group: str  # which point count normalises it: "cons" or "gen"
    solar: bool = False  # True -> forced to 0 when the sun is below the horizon


# How the meter codes relate to each other (verified on the community sums):
#
#   Anteil gemeinschaftliche Erzeugung  ==  Gesamte gemeinschaftliche Erzeugung
#       the whole community generation is distributed to the consumption points
#       by the allocation key -- the two codes are the same energy, once counted
#       on the generation and once on the consumption side.
#   Anteil  ==  Eigendeckung + Gemeinschaftsüberschuss
#       "Eigendeckung" is the part the members really consumed, the surplus goes
#       to the grid.
#
# Three models are therefore enough; `surplus` is derived so that the energy
# balance of the forecast is consistent by construction.
TARGETS: tuple[Target, ...] = (
    Target("consumption", CODE_CONSUMPTION, "Gesamtverbrauch der Mitglieder", "cons"),
    Target("generation", CODE_GENERATION, "Gesamte gemeinschaftliche Erzeugung", "gen", solar=True),
    Target("self_coverage", CODE_SELF_COVERAGE, "Eigendeckung aus der Gemeinschaft", "cons", solar=True),
)

# available as additional targets, but redundant with the above
EXTRA_TARGETS: tuple[Target, ...] = (
    Target("allocated", CODE_ALLOCATED, "Anteil gemeinschaftliche Erzeugung", "cons", solar=True),
    Target("surplus", CODE_SURPLUS, "Gemeinschaftsüberschuss", "gen", solar=True),
)

TARGETS_BY_KEY = {t.key: t for t in TARGETS + EXTRA_TARGETS}

# a day counts as delivered if at least this share of the present consumption
# points has a non-zero daily sum
MIN_REPORTING_SHARE = 0.85
# ignore the very early period where per-point averages are dominated by a
# handful of households
MIN_POINTS = 30


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------


def _connect():
    import psycopg

    os.environ.setdefault("PGSERVICEFILE", str(NOTEBOOKS_DIR / ".pg_service.conf"))
    os.environ.setdefault("PGPASSFILE", str(NOTEBOOKS_DIR / ".pgpass"))
    return psycopg.connect(service=PG_SERVICE)


def _query(sql: str) -> pd.DataFrame:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            cols = [c.name for c in cur.description]
            return pd.DataFrame(cur.fetchall(), columns=cols)


def load_totals(refresh: bool = False) -> pd.DataFrame:
    """Community sum per 15 min interval and meter code (long format)."""
    cache = CACHE_DIR / "totals.csv.gz"
    if refresh or not cache.exists():
        df = _query(
            """
            select m.timestamp, mc.description as code,
                   sum(m.value) as total, count(*) as n_rows
            from metering_measurement m
            join metering_metercode mc on mc.id = m.meter_code_id
            group by 1, 2
            """
        )
        df.to_csv(cache, index=False)
    df = pd.read_csv(cache, parse_dates=["timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    return df


def load_daily_points(refresh: bool = False) -> pd.DataFrame:
    """Per measurement point and local day: energy sum and number of intervals."""
    cache = CACHE_DIR / "daily_points.csv.gz"
    if refresh or not cache.exists():
        df = _query(
            """
            select (m.timestamp at time zone 'Europe/Vienna')::date as day,
                   m.measurement_point_id as point_id,
                   mc.description as code,
                   sum(m.value) as kwh,
                   count(*) as n_intervals
            from metering_measurement m
            join metering_metercode mc on mc.id = m.meter_code_id
            group by 1, 2, 3
            """
        )
        df.to_csv(cache, index=False)
    return pd.read_csv(cache, parse_dates=["day"])


# --------------------------------------------------------------------------
# panel: 15 min series + point counts + data quality flag
# --------------------------------------------------------------------------


def build_panel(refresh: bool = False) -> pd.DataFrame:
    """15 min UTC-indexed frame with totals, point counts and per-point values.

    Columns per target key:
        <key>_total   community sum [kWh per 15 min]
        <key>_pp      per active measurement point [kWh per 15 min]
    plus:
        n_cons        consumption points delivering data that day
        n_gen         generation points delivering data that day
        complete      True if the export is complete for that day
    """
    totals = load_totals(refresh)
    daily = load_daily_points(refresh)

    # --- daily point counts and completeness -----------------------------
    cons_daily = daily[daily.code == CODE_CONSUMPTION]
    per_day = cons_daily.groupby("day").agg(
        present=("point_id", "nunique"),
        reporting=("kwh", lambda s: int((s > 0).sum())),
    )
    per_day["share"] = per_day.reporting / per_day.present
    per_day["complete"] = (per_day.share >= MIN_REPORTING_SHARE) & (per_day.present >= MIN_POINTS)

    gen_daily = daily[daily.code == CODE_GENERATION]
    # generation points legitimately deliver 0 kWh on winter days (everything is
    # consumed behind the meter), so "present" is the right denominator here --
    # under-delivered days are already removed by the `complete` flag.
    gen_present = gen_daily.groupby("day")["point_id"].nunique()

    day_info = pd.DataFrame(
        {
            "n_cons": per_day.reporting,
            "n_gen": gen_present,
            "complete": per_day.complete,
        }
    )
    day_info["n_gen"] = day_info.n_gen.ffill().fillna(0)
    day_info.index = pd.to_datetime(day_info.index)

    # --- wide 15 min frame ------------------------------------------------
    wide = totals.pivot_table(index="timestamp", columns="code", values="total")
    wide = wide.sort_index().asfreq(FREQ)

    panel = pd.DataFrame(index=wide.index)
    local_day = pd.to_datetime(panel.index.tz_convert(TZ).date)
    info = day_info.reindex(local_day)
    panel["n_cons"] = info.n_cons.to_numpy()
    panel["n_gen"] = info.n_gen.to_numpy()
    panel["complete"] = info.complete.fillna(False).to_numpy()

    for target in TARGETS + EXTRA_TARGETS:
        total = wide[target.code] if target.code in wide.columns else np.nan
        denom = panel.n_cons if target.group == "cons" else panel.n_gen
        panel[f"{target.key}_total"] = total
        panel[f"{target.key}_pp"] = np.where(denom > 0, total / denom, np.nan)

    return panel


def last_complete_day(panel: pd.DataFrame) -> pd.Timestamp:
    """Last local day for which the EEG-Faktura export is fully delivered."""
    complete_days = pd.Series(
        panel["complete"].to_numpy(),
        index=pd.to_datetime(panel.index.tz_convert(TZ).date),
    )
    days = complete_days.groupby(level=0).max()
    return days[days].index.max()


# --------------------------------------------------------------------------
# weather (Open-Meteo)
# --------------------------------------------------------------------------

WEATHER_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "snowfall",
    "snow_depth",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "wind_speed_10m",
    "shortwave_radiation",
    "direct_radiation",
    "diffuse_radiation",
    "direct_normal_irradiance",
    "sunshine_duration",
]


def _fetch_open_meteo(url: str, params: dict) -> pd.DataFrame:
    query = urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(f"{url}?{query}", timeout=60) as response:
        payload = json.load(response)
    hourly = pd.DataFrame(payload["hourly"])
    hourly["time"] = pd.to_datetime(hourly["time"], utc=True)
    return hourly.set_index("time").sort_index()


def load_weather(start: pd.Timestamp, end: pd.Timestamp, refresh: bool = False) -> pd.DataFrame:
    """Hourly weather (UTC) covering `start`..`end`, history + forecast.

    The ERA5 archive lags roughly five days, therefore the recent past and the
    forecast horizon are taken from the forecast endpoint (`past_days`).
    """
    archive_cache = CACHE_DIR / "weather_archive.csv.gz"
    recent_cache = CACHE_DIR / "weather_recent.csv.gz"
    today = pd.Timestamp.now(tz="UTC").normalize()
    archive_end = (today - pd.Timedelta(days=8)).date()

    need_archive = refresh or not archive_cache.exists()
    if not need_archive:
        cached_end = pd.to_datetime(pd.read_csv(archive_cache, usecols=["time"])["time"], utc=True).max()
        need_archive = cached_end < pd.Timestamp(archive_end - timedelta(days=2), tz="UTC")
    if need_archive:
        archive = _fetch_open_meteo(
            "https://archive-api.open-meteo.com/v1/archive",
            {
                "latitude": LATITUDE,
                "longitude": LONGITUDE,
                "start_date": str(pd.Timestamp(start).tz_convert("UTC").date()),
                "end_date": str(archive_end),
                "hourly": ",".join(WEATHER_VARS),
                "timezone": "UTC",
            },
        )
        archive.to_csv(archive_cache)
    archive = pd.read_csv(archive_cache, parse_dates=["time"], index_col="time")
    archive.index = pd.to_datetime(archive.index, utc=True)

    # forecast endpoint: last 92 days + up to 16 days ahead
    stale = recent_cache.exists() and (
        pd.Timestamp.now().timestamp() - recent_cache.stat().st_mtime > 3 * 3600
    )
    if refresh or stale or not recent_cache.exists():
        recent = _fetch_open_meteo(
            "https://api.open-meteo.com/v1/forecast",
            {
                "latitude": LATITUDE,
                "longitude": LONGITUDE,
                "hourly": ",".join(WEATHER_VARS),
                "timezone": "UTC",
                "past_days": 92,
                "forecast_days": 16,
            },
        )
        recent.to_csv(recent_cache)
    recent = pd.read_csv(recent_cache, parse_dates=["time"], index_col="time")
    recent.index = pd.to_datetime(recent.index, utc=True)

    # archive (reanalysis) wins for the past, forecast fills the rest
    weather = pd.concat([archive, recent[~recent.index.isin(archive.index)]]).sort_index()
    weather = weather[~weather.index.duplicated(keep="first")]
    return weather.loc[str(pd.Timestamp(start).tz_convert("UTC").date()) :].reindex(
        columns=WEATHER_VARS
    )


def weather_to_15min(weather: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    """Interpolate hourly weather onto the 15 min model index."""
    upsampled = weather.reindex(weather.index.union(index)).interpolate("time", limit=8)
    return upsampled.reindex(index).ffill(limit=4).bfill(limit=4)


# --------------------------------------------------------------------------
# features
# --------------------------------------------------------------------------


def solar_position(index: pd.DatetimeIndex) -> pd.DataFrame:
    """Solar elevation/azimuth (degrees) and clear sky GHI (W/m²).

    Low precision NOAA algorithm -- accurate to ~0.01°, far more than enough as
    a model feature.
    """
    n = index.to_julian_date().to_numpy() - 2451545.0
    mean_long = np.radians((280.460 + 0.9856474 * n) % 360)
    anomaly = np.radians((357.528 + 0.9856003 * n) % 360)
    ecliptic_long = mean_long + np.radians(1.915) * np.sin(anomaly) + np.radians(0.020) * np.sin(
        2 * anomaly
    )
    obliquity = np.radians(23.439 - 0.0000004 * n)

    declination = np.arcsin(np.sin(obliquity) * np.sin(ecliptic_long))
    right_ascension = np.arctan2(np.cos(obliquity) * np.sin(ecliptic_long), np.cos(ecliptic_long))
    gmst_hours = (18.697374558 + 24.06570982441908 * n) % 24
    local_sidereal = np.radians((gmst_hours * 15.0 + LONGITUDE) % 360)
    hour_angle = local_sidereal - right_ascension

    lat = np.radians(LATITUDE)
    elevation = np.arcsin(
        np.sin(lat) * np.sin(declination) + np.cos(lat) * np.cos(declination) * np.cos(hour_angle)
    )
    azimuth = np.arctan2(
        -np.sin(hour_angle),
        np.tan(declination) * np.cos(lat) - np.sin(lat) * np.cos(hour_angle),
    )

    elevation_deg = np.degrees(elevation)
    sin_elev = np.clip(np.sin(elevation), 0, None)
    # Kasten-Young air mass + simple clear sky transmittance
    with np.errstate(divide="ignore", invalid="ignore"):
        air_mass = 1.0 / (
            sin_elev + 0.50572 * np.power(np.clip(elevation_deg, 0, None) + 6.07995, -1.6364)
        )
    clear_sky = np.where(sin_elev > 0, 1361.0 * sin_elev * np.power(0.7, np.power(air_mass, 0.678)), 0.0)

    return pd.DataFrame(
        {
            "solar_elevation": elevation_deg,
            "solar_azimuth": np.degrees(azimuth) % 360,
            "clear_sky_ghi": np.nan_to_num(clear_sky),
        },
        index=index,
    )


def _easter(year: int) -> date:
    """Anonymous Gregorian algorithm."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def austrian_holidays(years) -> set[date]:
    """Gesetzliche Feiertage in Österreich."""
    holidays: set[date] = set()
    for year in years:
        easter = _easter(year)
        holidays.update(
            {
                date(year, 1, 1),
                date(year, 1, 6),
                easter + timedelta(days=1),  # Ostermontag
                date(year, 5, 1),
                easter + timedelta(days=39),  # Christi Himmelfahrt
                easter + timedelta(days=50),  # Pfingstmontag
                easter + timedelta(days=60),  # Fronleichnam
                date(year, 8, 15),
                date(year, 10, 26),
                date(year, 11, 1),
                date(year, 12, 8),
                date(year, 12, 25),
                date(year, 12, 26),
            }
        )
    return holidays


def build_features(index: pd.DatetimeIndex, weather: pd.DataFrame) -> pd.DataFrame:
    """Calendar + solar + weather features for a 15 min UTC index."""
    local = index.tz_convert(TZ)
    features = pd.DataFrame(index=index)

    # --- calendar ---------------------------------------------------------
    quarter = local.hour * 4 + local.minute // 15
    features["quarter_of_day"] = quarter
    day_angle = 2 * np.pi * quarter / 96
    features["tod_sin"] = np.sin(day_angle)
    features["tod_cos"] = np.cos(day_angle)
    features["tod_sin2"] = np.sin(2 * day_angle)
    features["tod_cos2"] = np.cos(2 * day_angle)

    features["day_of_week"] = local.dayofweek
    features["is_weekend"] = (local.dayofweek >= 5).astype(int)
    holidays = austrian_holidays(range(local.year.min(), local.year.max() + 2))
    is_holiday = np.array([d in holidays for d in local.date])
    features["is_holiday"] = is_holiday.astype(int)
    features["is_off_day"] = ((local.dayofweek >= 5) | is_holiday).astype(int)

    year_angle = 2 * np.pi * local.dayofyear / 365.25
    features["doy_sin"] = np.sin(year_angle)
    features["doy_cos"] = np.cos(year_angle)
    features["doy_sin2"] = np.sin(2 * year_angle)
    features["doy_cos2"] = np.cos(2 * year_angle)
    features["month"] = local.month

    # --- solar geometry ---------------------------------------------------
    solar = solar_position(index)
    features = features.join(solar)
    features["is_day"] = (solar.solar_elevation > 0).astype(int)

    # --- weather ----------------------------------------------------------
    weather_15 = weather_to_15min(weather, index)
    features = features.join(weather_15)

    # --- derived ----------------------------------------------------------
    clear_sky = features["clear_sky_ghi"].replace(0, np.nan)
    features["clear_sky_index"] = (features["shortwave_radiation"] / clear_sky).clip(0, 1.5).fillna(0)
    features["temp_24h"] = features["temperature_2m"].rolling(96, min_periods=8, center=True).mean()
    features["temp_min_24h"] = features["temperature_2m"].rolling(96, min_periods=8, center=True).min()
    features["temp_max_24h"] = features["temperature_2m"].rolling(96, min_periods=8, center=True).max()
    features["heating_degrees"] = (16.0 - features["temp_24h"]).clip(lower=0)
    features["cooling_degrees"] = (features["temp_24h"] - 21.0).clip(lower=0)
    features["radiation_24h"] = (
        features["shortwave_radiation"].rolling(96, min_periods=8, center=True).mean()
    )
    features["radiation_3h"] = features["shortwave_radiation"].rolling(12, min_periods=2).mean()
    features["snow_cover"] = (features["snow_depth"] > 0.01).astype(int)

    return features


def build_frame(refresh: bool = False, horizon_days: int = 16) -> pd.DataFrame:
    """Panel + features, extended into the future by `horizon_days`."""
    panel = build_panel(refresh)

    end = pd.Timestamp.now(tz="UTC").normalize() + pd.Timedelta(days=horizon_days)
    index = pd.date_range(panel.index.min(), end, freq=FREQ, tz="UTC")
    weather = load_weather(index.min(), index.max(), refresh=refresh)
    features = build_features(index, weather)

    frame = features.join(panel.reindex(index))
    frame["complete"] = frame["complete"].fillna(False).astype(bool)
    frame.attrs["feature_columns"] = list(features.columns)
    return frame


# --------------------------------------------------------------------------
# model
# --------------------------------------------------------------------------

QUANTILES = (0.1, 0.9)


def _model(**kwargs) -> HistGradientBoostingRegressor:
    params = dict(
        max_iter=400,
        learning_rate=0.06,
        max_leaf_nodes=63,
        min_samples_leaf=40,
        l2_regularization=1.0,
        early_stopping=False,
        random_state=0,
    )
    params.update(kwargs)
    return HistGradientBoostingRegressor(**params)


def training_mask(frame: pd.DataFrame, key: str, until: pd.Timestamp | None = None) -> pd.Series:
    mask = frame["complete"] & frame[f"{key}_pp"].notna() & frame[feature_columns(frame)].notna().all(axis=1)
    if until is not None:
        mask &= frame.index < until
    return mask


def feature_columns(frame: pd.DataFrame) -> list[str]:
    return frame.attrs["feature_columns"]


# The per-point level drifts upwards (members join with heat pumps / EVs, PV
# gets extended): June 2024 4.7 -> June 2025 7.4 -> June 2026 8.8 kWh per
# consumption point and day.  Older data is therefore down-weighted and the
# level is re-calibrated on the most recent complete weeks.  Shorter half-lives
# than ~120 days sharpen the level further but stop covering the same season one
# year back, which is why the seasonal information is kept.
HALF_LIFE_DAYS = 120
CALIBRATION_DAYS = 28
CALIBRATION_LIMITS = (0.6, 1.6)


def _sample_weights(index: pd.DatetimeIndex, half_life_days: float | None) -> np.ndarray | None:
    if not half_life_days:
        return None
    age_days = (index.max() - index).total_seconds() / 86400.0
    return np.power(0.5, age_days / half_life_days)


def train(
    frame: pd.DataFrame,
    until: pd.Timestamp | None = None,
    keys=None,
    quantiles: tuple[float, ...] = QUANTILES,
    half_life_days: float | None = HALF_LIFE_DAYS,
    calibration_days: int = CALIBRATION_DAYS,
) -> dict:
    """Fit one point-forecast model (+ optional quantile models) per target.

    `calibration_days` > 0 adds a multiplicative level correction that is
    estimated out of sample: a model fitted without the most recent weeks is
    used to predict them, and the ratio actual/predicted corrects the level of
    the final model.
    """
    keys = keys or [t.key for t in TARGETS]
    columns = feature_columns(frame)
    models: dict[str, dict] = {}

    for key in keys:
        mask = training_mask(frame, key, until)
        index = frame.index[mask]
        X = frame.loc[mask, columns]
        y = frame.loc[mask, f"{key}_pp"]
        weights = _sample_weights(index, half_life_days)

        entry: dict = {"mean": _model().fit(X, y, sample_weight=weights), "n_train": int(mask.sum())}
        for q in quantiles:
            entry[f"q{int(q * 100)}"] = _model(loss="quantile", quantile=q, max_iter=250).fit(
                X, y, sample_weight=weights
            )
        entry["scale"] = 1.0
        models[key] = entry

        if calibration_days:
            split = index.max() - pd.Timedelta(days=calibration_days)
            fit_mask, holdout = index < split, index >= split
            if fit_mask.sum() > 96 * 60 and holdout.sum() > 96 * 7:
                warmup = {"mean": _model().fit(
                    X[fit_mask], y[fit_mask],
                    sample_weight=None if weights is None else weights[fit_mask],
                ), "scale": 1.0}
                predicted = _predict_pp(
                    {key: warmup}, key, frame, index[holdout]
                )["mean"].sum()
                if predicted > 0:
                    ratio = float(y[holdout].sum() / predicted)
                    entry["scale"] = float(np.clip(ratio, *CALIBRATION_LIMITS))
    return models


def _predict_pp(models: dict, key: str, frame: pd.DataFrame, index: pd.DatetimeIndex) -> pd.DataFrame:
    X = frame.loc[index, feature_columns(frame)]
    target = TARGETS_BY_KEY[key]
    scale = models[key].get("scale", 1.0)
    out = {}
    for name, model in models[key].items():
        if name in ("n_train", "scale"):
            continue
        pred = np.clip(model.predict(X), 0, None) * scale
        if target.solar:
            # no community generation while the sun is below the horizon
            pred = np.where(frame.loc[index, "clear_sky_ghi"].to_numpy() <= 0, 0.0, pred)
        out[name] = pred
    return pd.DataFrame(out, index=index)


def project_point_counts(panel: pd.DataFrame, index: pd.DatetimeIndex, window_days: int = 120) -> pd.DataFrame:
    """Extrapolate the number of active measurement points into the future.

    Linear trend over the last `window_days` complete days, never below the last
    observed value (members join, they rarely leave).
    """
    daily = pd.DataFrame(
        {
            "n_cons": panel.n_cons.to_numpy(),
            "n_gen": panel.n_gen.to_numpy(),
            "complete": panel.complete.to_numpy(),
        },
        index=pd.to_datetime(panel.index.tz_convert(TZ).date),
    )
    daily = daily[daily.complete].groupby(level=0).max()
    recent = daily.tail(window_days)
    days = (recent.index - recent.index[0]).days.to_numpy()

    target_days = pd.to_datetime(index.tz_convert(TZ).date)
    ahead = (target_days - recent.index[0]).days.to_numpy()

    projected = {}
    for column in ("n_cons", "n_gen"):
        slope, intercept = np.polyfit(days, recent[column].to_numpy(), 1)
        slope = max(slope, 0.0)
        last = recent[column].iloc[-1]
        projected[column] = np.maximum(intercept + slope * ahead, last)
    return pd.DataFrame(projected, index=index)


def forecast(
    frame: pd.DataFrame,
    models: dict,
    start: pd.Timestamp | None = None,
    days: int = 14,
    point_counts: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Forecast the community series from `start` (default: first missing day).

    Returns a 15 min frame with per-point predictions (`*_pp`), community totals
    (`*_kwh`) and the p10/p90 band, plus the point counts used for scaling.
    """
    if start is None:
        start = (last_complete_day(frame) + pd.Timedelta(days=1)).tz_localize(TZ).tz_convert("UTC")
    start = pd.Timestamp(start)
    if start.tzinfo is None:
        start = start.tz_localize(TZ)
    end = start + pd.Timedelta(days=days)

    index = frame.index[(frame.index >= start) & (frame.index < end)]
    index = index[frame.loc[index, feature_columns(frame)].notna().all(axis=1)]
    if len(index) == 0:
        raise ValueError("no weather data available for the requested horizon")

    counts = point_counts if point_counts is not None else project_point_counts(frame, index)
    result = pd.DataFrame(index=index)
    result["local_time"] = index.tz_convert(TZ)
    result["n_cons"] = counts.n_cons.round().astype(int)
    result["n_gen"] = counts.n_gen.round().astype(int)

    for key in models:
        target = TARGETS_BY_KEY[key]
        scale = result.n_cons if target.group == "cons" else result.n_gen
        predictions = _predict_pp(models, key, frame, index)
        for name, values in predictions.items():
            suffix = "" if name == "mean" else f"_{name}"
            result[f"{key}_pp{suffix}"] = values
            result[f"{key}_kwh{suffix}"] = values * scale

    return _close_energy_balance(result)


def _close_energy_balance(result: pd.DataFrame) -> pd.DataFrame:
    """Make the forecast physically consistent.

    The models are fitted independently, so nothing stops them from predicting
    more community coverage than there is consumption or generation.  The self
    coverage is therefore capped at min(consumption, generation) and the surplus
    is derived from the capped value instead of being predicted separately.
    """
    if not {"consumption_kwh", "generation_kwh", "self_coverage_kwh"} <= set(result.columns):
        return result

    cap = np.minimum(result.consumption_kwh, result.generation_kwh)
    for column in [c for c in result.columns if c.startswith("self_coverage_kwh")]:
        quantile = column.removeprefix("self_coverage_kwh")
        result[column] = np.minimum(result[column], cap)
        result[f"self_coverage_pp{quantile}"] = result[column] / result.n_cons

    result["surplus_kwh"] = (result.generation_kwh - result.self_coverage_kwh).clip(lower=0)
    for quantile in ("_q10", "_q90"):
        if f"generation_kwh{quantile}" in result.columns:
            result[f"surplus_kwh{quantile}"] = (
                result[f"generation_kwh{quantile}"] - result.self_coverage_kwh
            ).clip(lower=0)

    result["coverage_pct"] = 100 * result.self_coverage_kwh / result.consumption_kwh.replace(0, np.nan)
    return result


def daily_summary(forecast_frame: pd.DataFrame) -> pd.DataFrame:
    """Aggregate a 15 min forecast to local daily totals [kWh]."""
    local = forecast_frame.set_index(pd.DatetimeIndex(forecast_frame["local_time"]))
    value_columns = [c for c in local.columns if c.endswith("_kwh") or "_kwh_" in c]
    daily = local[value_columns].resample("D").sum()
    daily["n_cons"] = local["n_cons"].resample("D").max()
    daily["n_gen"] = local["n_gen"].resample("D").max()
    if {"consumption_kwh", "self_coverage_kwh"} <= set(daily.columns):
        daily["coverage_pct"] = 100 * daily.self_coverage_kwh / daily.consumption_kwh
    return daily.round(1)


# --------------------------------------------------------------------------
# storing forecasts in the database
# --------------------------------------------------------------------------

MODEL_VERSION = "gbt-1.0"

# forecast column -> database column
STORED_COLUMNS = {
    "consumption_kwh": "consumption_kwh",
    "consumption_kwh_q10": "consumption_kwh_p10",
    "consumption_kwh_q90": "consumption_kwh_p90",
    "generation_kwh": "generation_kwh",
    "generation_kwh_q10": "generation_kwh_p10",
    "generation_kwh_q90": "generation_kwh_p90",
    "self_coverage_kwh": "self_coverage_kwh",
    "self_coverage_kwh_q10": "self_coverage_kwh_p10",
    "self_coverage_kwh_q90": "self_coverage_kwh_p90",
    "surplus_kwh": "surplus_kwh",
    "surplus_kwh_q10": "surplus_kwh_p10",
    "surplus_kwh_q90": "surplus_kwh_p90",
    "n_cons": "n_consumption_points",
    "n_gen": "n_generation_points",
}


def store_forecast(frame: pd.DataFrame, forecast_frame: pd.DataFrame, models: dict,
                   model_version: str = MODEL_VERSION,
                   data_until: pd.Timestamp | None = None) -> int:
    """Write a forecast run to metering_energyforecastrun / metering_energyforecast.

    Every run is stored on its own and never overwritten -- that is what makes
    the later comparison against the real measurements possible (view
    `energy_forecast_vs_actual`).  Returns the new run id.
    """
    from psycopg.types.json import Json

    missing = [c for c in STORED_COLUMNS if c not in forecast_frame.columns]
    if missing:
        raise ValueError(f"forecast is missing columns: {missing}")

    parameters = {
        "half_life_days": HALF_LIFE_DAYS,
        "calibration_days": CALIBRATION_DAYS,
        "n_features": len(feature_columns(frame)),
        "scale": {key: round(entry.get("scale", 1.0), 4) for key, entry in models.items()},
        "n_train": {key: entry.get("n_train") for key, entry in models.items()},
    }

    index = forecast_frame.index
    rows = [
        (
            timestamp.to_pydatetime(),
            *[None if pd.isna(value) else float(value)
              for value in forecast_frame.loc[timestamp, list(STORED_COLUMNS)]],
        )
        for timestamp in index
    ]

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO metering_energyforecastrun
                    (created_at, model_version, data_until, horizon_start, horizon_end,
                     training_intervals, parameters)
                VALUES (now(), %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    model_version,
                    (data_until if data_until is not None else last_complete_day(frame)).date(),
                    index.min().to_pydatetime(),
                    index.max().to_pydatetime(),
                    int(frame.complete.sum()),
                    Json(parameters),
                ),
            )
            run_id = cur.fetchone()[0]

            columns = ", ".join(STORED_COLUMNS.values())
            placeholders = ", ".join(["%s"] * (len(STORED_COLUMNS) + 2))
            cur.executemany(
                f"INSERT INTO metering_energyforecast (run_id, timestamp, {columns}) "
                f"VALUES ({placeholders})",
                [(run_id, *row) for row in rows],
            )
        conn.commit()

    print(f"Prognoselauf {run_id} gespeichert: {len(rows)} Intervalle "
          f"({index.min().tz_convert(TZ).date()} bis {index.max().tz_convert(TZ).date()})")
    return run_id


HINDCAST_VERSION = f"{MODEL_VERSION}-hindcast"


def store_hindcast_runs(frame: pd.DataFrame, n_runs: int = 3, horizon_days: int = 14) -> list[int]:
    """Prognoseläufe für bereits vergangene Zeiträume nachrechnen und speichern.

    Trainiert wird ausschließlich mit Daten vor dem jeweiligen Stichtag, die
    Läufe sind also echte Out-of-sample-Prognosen. Ein Unterschied zum
    Echtbetrieb bleibt: das Wetter ist hier das tatsächlich eingetretene und
    nicht die damalige Vorhersage. Deshalb bekommen diese Läufe eine eigene
    `model_version` -- sie fallen im Vergleich etwas zu gut aus.
    """
    last_day = last_complete_day(frame)
    run_ids = []
    for step in range(n_runs, 0, -1):
        cutoff_day = last_day - pd.Timedelta(days=horizon_days * step)
        cutoff = cutoff_day.tz_localize(TZ).tz_convert("UTC")
        models = train(frame, until=cutoff)

        start = (cutoff_day + pd.Timedelta(days=1)).tz_localize(TZ)
        index = frame.index[(frame.index >= start.tz_convert("UTC"))
                            & (frame.index < start.tz_convert("UTC") + pd.Timedelta(days=horizon_days))]
        # nur die Zählpunktentwicklung verwenden, die damals bekannt war
        counts = project_point_counts(frame[frame.index < cutoff], index)
        result = forecast(frame, models, start=start, days=horizon_days, point_counts=counts)
        run_ids.append(store_forecast(frame, result, models,
                                      model_version=HINDCAST_VERSION, data_until=cutoff_day))
    return run_ids


def load_evaluation(run_id: int | None = None, only_complete: bool = True,
                    only_full_days: bool = True) -> pd.DataFrame:
    """Read `energy_forecast_vs_actual`: forecast vs. measurement, per run and day.

    `only_complete` keeps the days whose EEG-Faktura delivery is complete --
    partially delivered days would look like a huge forecast error.
    `only_full_days` drops the partial days at the edges of a horizon.
    """
    conditions = ["consumption_actual IS NOT NULL"]
    if only_complete:
        conditions.append("actual_is_complete")
    if only_full_days:
        conditions.append("intervals = 96")
    if run_id is not None:
        conditions.append(f"run_id = {int(run_id)}")

    query = f"""
        SELECT * FROM energy_forecast_vs_actual
        WHERE {' AND '.join(conditions)}
        ORDER BY run_id, day
    """
    frame = _query(query)
    for key in ("consumption", "generation", "self_coverage", "surplus"):
        forecast, actual = f"{key}_forecast", f"{key}_actual"
        if forecast in frame.columns:
            frame[forecast] = frame[forecast].astype(float)
            frame[actual] = frame[actual].astype(float)
            frame[f"{key}_error"] = frame[forecast] - frame[actual]
            frame[f"{key}_error_pct"] = 100 * frame[f"{key}_error"] / frame[actual].replace(0, np.nan)
    return frame


def evaluation_summary(evaluation: pd.DataFrame) -> pd.DataFrame:
    """Mean absolute error per target over all evaluated days."""
    rows = []
    for key in ("consumption", "generation", "self_coverage", "surplus"):
        if f"{key}_forecast" not in evaluation.columns:
            continue
        actual, forecast = evaluation[f"{key}_actual"], evaluation[f"{key}_forecast"]
        rows.append({
            "target": key,
            "days": int(actual.notna().sum()),
            "mae_kwh": float((forecast - actual).abs().mean()),
            "nmae_pct": float(100 * (forecast - actual).abs().mean() / actual.mean()),
            "bias_kwh": float((forecast - actual).mean()),
        })
    return pd.DataFrame(rows).round(2)


# --------------------------------------------------------------------------
# evaluation
# --------------------------------------------------------------------------


def seasonal_baseline(frame: pd.DataFrame, key: str, until: pd.Timestamp, index: pd.DatetimeIndex,
                      lookback_days: int = 28) -> pd.Series:
    """Naive reference: mean per (weekday, quarter of day) of the last complete weeks."""
    window = frame[
        frame.complete
        & (frame.index < until)
        & (frame.index >= until - pd.Timedelta(days=lookback_days * 3))
    ]
    window = window[window[f"{key}_pp"].notna()]
    window = window[window.index >= window.index.max() - pd.Timedelta(days=lookback_days)]
    profile = window.groupby([window["day_of_week"], window["quarter_of_day"]])[f"{key}_pp"].mean()

    wanted = pd.MultiIndex.from_arrays(
        [frame.loc[index, "day_of_week"], frame.loc[index, "quarter_of_day"]]
    )
    values = profile.reindex(wanted).to_numpy()
    return pd.Series(np.nan_to_num(values, nan=float(window[f"{key}_pp"].mean())), index=index)


def _metrics(actual: pd.Series, predicted: pd.Series) -> dict:
    err = predicted - actual
    denominator = actual.mean()
    return {
        "mae": float(np.abs(err).mean()),
        "rmse": float(np.sqrt((err**2).mean())),
        "bias": float(err.mean()),
        "nmae_pct": float(100 * np.abs(err).mean() / denominator) if denominator else np.nan,
    }


def backtest(
    frame: pd.DataFrame,
    folds: int = 6,
    horizon_days: int = 14,
    keys=None,
    verbose: bool = True,
    **train_kwargs,
) -> pd.DataFrame:
    """Rolling origin evaluation: train on the past, predict `horizon_days` ahead.

    Evaluated on complete days only, on the per-point series (scaling by the
    point count is a separate, deterministic step) and on daily totals.
    """
    keys = keys or [t.key for t in TARGETS]
    complete_days = pd.Series(
        frame.complete.to_numpy(), index=pd.to_datetime(frame.index.tz_convert(TZ).date)
    ).groupby(level=0).max()
    days = complete_days[complete_days].index
    last_day = days.max()

    rows = []
    for fold in range(folds, 0, -1):
        cutoff_day = last_day - pd.Timedelta(days=horizon_days * fold)
        cutoff = cutoff_day.tz_localize(TZ).tz_convert("UTC")
        test_end = cutoff + pd.Timedelta(days=horizon_days)
        models = train(frame, until=cutoff, keys=keys, quantiles=(), **train_kwargs)

        test_mask = frame.complete & (frame.index >= cutoff) & (frame.index < test_end)
        if verbose:
            print(f"fold {folds - fold + 1}/{folds}: train < {cutoff_day.date()}, "
                  f"test {int(test_mask.sum())} intervals")
        for key in keys:
            mask = test_mask & frame[f"{key}_pp"].notna() & frame[feature_columns(frame)].notna().all(axis=1)
            if mask.sum() < 96:
                continue
            index = frame.index[mask]
            actual = frame.loc[index, f"{key}_pp"]
            predicted = _predict_pp(models, key, frame, index)["mean"]
            baseline = seasonal_baseline(frame, key, cutoff, index)

            daily_actual = actual.groupby(index.tz_convert(TZ).date).sum()
            daily_pred = predicted.groupby(index.tz_convert(TZ).date).sum()
            daily_base = baseline.groupby(index.tz_convert(TZ).date).sum()

            rows.append(
                {
                    "fold": folds - fold + 1,
                    "cutoff": cutoff_day.date(),
                    "target": key,
                    "n_test": int(mask.sum()),
                    **{f"model_{k}": v for k, v in _metrics(actual, predicted).items()},
                    **{f"base_{k}": v for k, v in _metrics(actual, baseline).items()},
                    "model_daily_nmae_pct": _metrics(daily_actual, daily_pred)["nmae_pct"],
                    "base_daily_nmae_pct": _metrics(daily_actual, daily_base)["nmae_pct"],
                }
            )
    return pd.DataFrame(rows)


def backtest_summary(results: pd.DataFrame) -> pd.DataFrame:
    summary = results.groupby("target").agg(
        folds=("fold", "nunique"),
        model_nmae_pct=("model_nmae_pct", "mean"),
        base_nmae_pct=("base_nmae_pct", "mean"),
        model_daily_nmae_pct=("model_daily_nmae_pct", "mean"),
        base_daily_nmae_pct=("base_daily_nmae_pct", "mean"),
        model_bias=("model_bias", "mean"),
    )
    summary["skill_vs_baseline_pct"] = 100 * (1 - summary.model_nmae_pct / summary.base_nmae_pct)
    summary["skill_daily_pct"] = 100 * (
        1 - summary.model_daily_nmae_pct / summary.base_daily_nmae_pct
    )
    return summary.round(2)


def feature_importance(frame: pd.DataFrame, models: dict, key: str, n_repeats: int = 3,
                       sample: int = 20000, seed: int = 0) -> pd.Series:
    """Permutation importance of the point-forecast model (drop in R²)."""
    from sklearn.inspection import permutation_importance

    mask = training_mask(frame, key)
    index = frame.index[mask]
    rng = np.random.default_rng(seed)
    if len(index) > sample:
        index = index[np.sort(rng.choice(len(index), sample, replace=False))]
    X = frame.loc[index, feature_columns(frame)]
    y = frame.loc[index, f"{key}_pp"]
    result = permutation_importance(models[key]["mean"], X, y, n_repeats=n_repeats, random_state=seed)
    return pd.Series(result.importances_mean, index=X.columns).sort_values(ascending=False)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Energieprognose ischlstrom")
    parser.add_argument("--refresh", action="store_true", help="reload from DB and Open-Meteo")
    parser.add_argument("--days", type=int, default=14, help="forecast horizon in days")
    parser.add_argument("--start", default=None, help="start day (YYYY-MM-DD, default: first missing day)")
    parser.add_argument("--backtest", action="store_true", help="run the rolling origin evaluation")
    parser.add_argument("--folds", type=int, default=6)
    parser.add_argument("--out", default=str(CACHE_DIR / "forecast.csv"))
    parser.add_argument("--store", action="store_true",
                        help="Prognoselauf in die DB schreiben (Website + späterer Vergleich)")
    parser.add_argument("--evaluate", action="store_true",
                        help="gespeicherte Prognosen gegen die inzwischen eingetroffenen Messdaten halten")
    parser.add_argument("--hindcast", type=int, default=0, metavar="N",
                        help="zusätzlich N Läufe für bereits vergangene Zeiträume nachrechnen und speichern")
    args = parser.parse_args()

    if args.hindcast:
        frame = build_frame(refresh=args.refresh)
        store_hindcast_runs(frame, n_runs=args.hindcast, horizon_days=min(args.days, 14))

    if args.evaluate:
        evaluation = load_evaluation()
        if evaluation.empty:
            print("noch keine gespeicherte Prognose, für die es schon Messdaten gibt")
        else:
            columns = ["run_id", "day", "days_ahead", "consumption_forecast", "consumption_actual",
                       "generation_forecast", "generation_actual",
                       "self_coverage_forecast", "self_coverage_actual"]
            print(evaluation[columns].round(1).to_string(index=False))
            print()
            print(evaluation_summary(evaluation).to_string(index=False))
        if not args.store:
            return

    frame = build_frame(refresh=args.refresh)
    print(f"data until {last_complete_day(frame).date()} (complete days), "
          f"{int(frame.complete.sum())} training intervals available")

    if args.backtest:
        results = backtest(frame, folds=args.folds, horizon_days=args.days)
        print()
        print(backtest_summary(results).to_string())
        print()

    models = train(frame)
    result = forecast(frame, models, start=args.start, days=args.days)
    result.to_csv(args.out)
    summary = daily_summary(result)
    columns = [c for c in ("consumption_kwh", "generation_kwh", "self_coverage_kwh", "surplus_kwh",
                           "coverage_pct", "n_cons", "n_gen") if c in summary.columns]
    print(summary[columns].to_string())
    print(f"\n15 min forecast written to {args.out}")

    if args.store:
        store_forecast(frame, result, models)


if __name__ == "__main__":
    main()
