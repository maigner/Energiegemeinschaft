#!/usr/bin/env python3
"""Energiedaten von EEG-Faktura holen und in `metering_measurement` schreiben.

Ersetzt den Weg über den Excel-Energy-Report (Notebook
`EEG Faktura Energy Report.ipynb`, bleibt als manueller Rückfall): die
Viertelstundenwerte kommen direkt aus dem Energystore von EEG-Faktura
(`POST /energystore/query/rawdata`, Basic-Auth gegen Keycloak plus Header
`X-Tenant`). Quelle der API-Semantik ist der Quellcode des Energystores
(github.com/eegfaktura/eegfaktura-energystore, AGPL):

- `start`/`end` sind Unix-Millisekunden, `cps` die Zählpunkte. Leer heißt
  "alle im Zeitraum aktiven", das löst der Server aber über einen internen
  Stammdaten-Dienst (gRPC) auf, der ausfallen kann. Vorgabe hier ist deshalb
  die Zählpunktliste aus `members_measurementpoint` (`--cps db`); unbekannte
  Zählpunkte überspringt der Server einfach.
- Antwort je Zählpunkt: `{"direction": ..., "data": [{"ts", "value", "qov"}]}`.
  Verbraucher tragen drei Werte je Viertelstunde, Erzeuger zwei, in dieser
  Reihenfolge (utils/counterpoint.go, DecodeMeterCode):

      CONSUMPTION  value[0] G.01 Gesamtverbrauch lt. Messung
                   value[1] G.02 Anteil gemeinschaftliche Erzeugung
                   value[2] G.03 Eigendeckung gemeinschaftliche Erzeugung
      GENERATION   value[0] G.01 Gesamte gemeinschaftliche Erzeugung
                   value[1] P.01 Gesamt/Überschusserzeugung

  Das sind genau die fünf Beschreibungen in `metering_metercode`.
- Zählpunkte ohne Lieferung an einem Tag kommen als Nullen mit qov 0 zurück
  und werden übersprungen (keine Messwerte).
- `qov` ist das Qualitätskennzeichen je Wert (1 = L1, 2 = L2, 3 = L3,
  0 = unbekannt); es wird nur gezählt, nicht gespeichert.
- Der Server dekodiert den Basic-Auth-Header mit *URL-sicherem* Base64, das
  Skript kodiert deshalb genauso (Standard-Base64 mit `+`/`/` scheitert).
- Jeder Aufruf löst eine Passwort-Anmeldung bei Keycloak aus. Deshalb: wenig
  Aufrufe (ein Tag je Aufruf, alle Zählpunkte auf einmal), Pause dazwischen,
  bei 403 sofort abbrechen statt wiederholen.

Fenster: vom letzten Tag in der DB minus `--overlap-days` (Netz OÖ liefert
spät und teilweise nach) bis gestern, höchstens `--max-days` je Lauf. Ein Tag
je Anfrage und je Transaktion; ein Abbruch mitten im Lauf lässt die fertigen
Tage in der DB.

Zugangsdaten aus `notebooks/.env` (gitignoriert) oder der Umgebung:
FAKTURA_USER, FAKTURA_PASSWORD, RC_NUMBER, EC_ID; optional FAKTURA_BASE_URL und
EEG_DB_DSN (Vorgabe `service=eeg-middleware`).

Aufrufe (aus notebooks/energyData, mit dem Repo-.venv):

    python eegfaktura_import.py --verify 2026-08-20      # Tag holen, mit DB vergleichen, nichts schreiben
    python eegfaktura_import.py --dry-run                 # Fenster holen, nichts schreiben
    python eegfaktura_import.py                           # Fenster holen, schreiben, Views auffrischen
    python eegfaktura_import.py --from 2026-08-01 --to 2026-08-15
    python eegfaktura_import.py --forecast                # danach eeg_forecast.py --refresh --days 30 --store
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

BASE_DIR = Path(__file__).resolve().parent
NOTEBOOKS_DIR = BASE_DIR.parent
TZ = ZoneInfo("Europe/Vienna")

DEFAULT_BASE_URL = "https://eegfaktura.at/energystore"
DEFAULT_DSN = "service=eeg-middleware"
DEFAULT_FORECAST_SCRIPT = NOTEBOOKS_DIR / "forecast" / "eeg_forecast.py"

# Reihenfolge der Werte je Richtung, siehe Modul-Docstring
CODES_BY_DIRECTION = {
    "CONSUMPTION": (
        "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)",
        "Anteil gemeinschaftliche Erzeugung",
        "Eigendeckung gemeinschaftliche Erzeugung",
    ),
    "GENERATION": (
        "Gesamte gemeinschaftliche Erzeugung",
        "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
    ),
}
UNIT = "KWH"
QOV_LABELS = {0: "qov=0 (unbekannt)", 1: "L1", 2: "L2", 3: "L3", -1: "ohne qov"}

MATERIALIZED_VIEWS = ("weekly_metering_summary", "daily_metering_summary", "daily_metering_quality")

# Vergleichsversatz beim --verify, um einen Zeitzonenfehler der API zu erkennen
VERIFY_SHIFTS_MIN = (-120, -60, 0, 60, 120)


def log(msg: str) -> None:
    print(f"{datetime.now(TZ):%H:%M:%S} {msg}", flush=True)


# --------------------------------------------------------------------------
# Konfiguration
# --------------------------------------------------------------------------


class ConfigError(Exception):
    pass


def load_dotenv_files() -> None:
    """KEY=VALUE-Zeilen aus notebooks/.env (und dem alten Spike-Ort) in die
    Umgebung übernehmen, ohne vorhandene Variablen zu überschreiben."""
    for path in (NOTEBOOKS_DIR / ".env", NOTEBOOKS_DIR / "eegfaktura" / ".env"):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            os.environ.setdefault(key, value)


@dataclass
class Config:
    user: str
    password: str
    tenant: str
    ec_id: str
    base_url: str
    dsn: str

    @classmethod
    def from_env(cls) -> "Config":
        load_dotenv_files()
        user = os.environ.get("FAKTURA_USER", "").strip()
        # PASSWORD: Name aus dem alten Spike-Notebook
        password = os.environ.get("FAKTURA_PASSWORD") or os.environ.get("PASSWORD") or ""
        tenant = os.environ.get("RC_NUMBER", "").strip().upper()
        # Gemeinschafts-ID (33 Zeichen, AT003...): der Energystore legt je
        # Tenant und ecId einen eigenen Speicher an; mit einer falschen ecId
        # antwortet er stumm mit einem leeren Ergebnis statt mit einem Fehler.
        ec_id = os.environ.get("EC_ID", "").strip().upper()
        missing = [name for name, value in (("FAKTURA_USER", user), ("FAKTURA_PASSWORD", password),
                                            ("RC_NUMBER", tenant), ("EC_ID", ec_id)) if not value]
        if missing:
            raise ConfigError("fehlende Zugangsdaten: " + ", ".join(missing)
                              + f" (notebooks/.env oder Umgebung, Vorlage notebooks/.env.example)")
        if ":" in password:
            # der Server trennt Benutzer und Passwort am ersten Doppelpunkt
            raise ConfigError("FAKTURA_PASSWORD darf keinen Doppelpunkt enthalten (Server-Einschränkung)")
        if not re.fullmatch(r"AT[0-9A-Z]{31}", ec_id):
            raise ConfigError("EC_ID muss die 33-stellige Gemeinschafts-ID sein (AT003..., "
                              "steht in EEG-Faktura unter Stammdaten und im Energy-Report, Blatt Summary)")
        return cls(
            user=user,
            password=password,
            tenant=tenant,
            ec_id=ec_id,
            base_url=os.environ.get("FAKTURA_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
            dsn=os.environ.get("EEG_DB_DSN", DEFAULT_DSN),
        )


# --------------------------------------------------------------------------
# EEG-Faktura API
# --------------------------------------------------------------------------


class ApiError(Exception):
    pass


class AuthError(ApiError):
    pass


def basic_auth_header(user: str, password: str) -> str:
    # energystore: base64.URLEncoding.DecodeString -> URL-sicheres Alphabet
    token = base64.urlsafe_b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return "Basic " + token


def post_json(cfg: Config, path: str, body: dict, timeout: float) -> dict:
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        cfg.base_url + path,
        data=data,
        method="POST",
        headers={
            "Authorization": basic_auth_header(cfg.user, cfg.password),
            "X-Tenant": cfg.tenant,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "ischlstrom-eegfaktura-import/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as err:
        text = err.read().decode("utf-8", "replace")[:500]
        if err.code in (401, 403):
            raise AuthError(f"HTTP {err.code} bei {path}: Anmeldung oder Tenant abgelehnt ({text!r})") from None
        if 400 <= err.code < 500:
            raise ApiError(f"HTTP {err.code} bei {path}: {text!r}") from None
        raise ApiError(f"HTTP {err.code} bei {path}: {text!r}", err.code) from None
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as err:
        raise ApiError(f"keine JSON-Antwort von {path}: {raw[:200]!r}") from err


def is_retryable(err: Exception) -> bool:
    if isinstance(err, AuthError):
        return False
    if isinstance(err, ApiError):
        return len(err.args) > 1 and isinstance(err.args[1], int) and err.args[1] >= 500
    return isinstance(err, (urllib.error.URLError, TimeoutError, ConnectionError))


def fetch_with_retry(cfg: Config, path: str, body: dict, timeout: float, retries: int, pause: float) -> dict:
    attempt = 0
    while True:
        try:
            return post_json(cfg, path, body, timeout)
        except Exception as err:  # noqa: BLE001 - gezielt unten gefiltert
            if not is_retryable(err) or attempt >= retries:
                raise
            attempt += 1
            wait = pause * (2 ** attempt)
            log(f"  Fehler ({err}), Versuch {attempt}/{retries} in {wait:.0f} s")
            time.sleep(wait)


def to_millis(moment: datetime) -> int:
    return int(moment.timestamp() * 1000)


def fetch_range(cfg: Config, first_day: date, last_day: date, cps: list[str], *, timeout: float,
                retries: int, pause: float) -> dict:
    """Rohdaten für first_day 00:00 bis last_day 23:59:59 (Europe/Vienna)."""
    start = datetime.combine(first_day, datetime.min.time(), tzinfo=TZ)
    end = datetime.combine(last_day + timedelta(days=1), datetime.min.time(), tzinfo=TZ) - timedelta(seconds=1)
    body = {
        "ecId": cfg.ec_id,
        "start": to_millis(start),
        "end": to_millis(end),
        "cps": [{"meteringPoint": mp} for mp in cps],
    }
    payload = fetch_with_retry(cfg, "/query/rawdata", body, timeout, retries, pause)
    if not isinstance(payload, dict):
        raise ApiError(f"unerwartete Antwortform: {type(payload).__name__}")
    return payload


def fetch_metadata(cfg: Config, *, timeout: float, retries: int, pause: float) -> dict:
    return fetch_with_retry(cfg, f"/query/{cfg.ec_id}/metadata", {}, timeout, retries, pause)


# --------------------------------------------------------------------------
# Antwort -> Zeilen
# --------------------------------------------------------------------------


@dataclass
class ParseStats:
    points_seen: int = 0
    points_with_data: int = 0
    points_without_delivery: int = 0
    skipped_values: int = 0
    unknown_points: set = field(default_factory=set)
    unknown_directions: Counter = field(default_factory=Counter)
    qov: Counter = field(default_factory=Counter)
    ts_min: datetime | None = None
    ts_max: datetime | None = None

    def note_ts(self, ts: datetime) -> None:
        if self.ts_min is None or ts < self.ts_min:
            self.ts_min = ts
        if self.ts_max is None or ts > self.ts_max:
            self.ts_max = ts


Row = tuple[datetime, float, int, int]  # timestamp, value, measurement_point_id, meter_code_id


def rows_from_payload(payload: dict, point_ids: dict[str, int], code_ids: dict[str, int],
                      ts_shift: timedelta) -> tuple[dict[tuple[int, int, datetime], float], ParseStats]:
    """Antwort in ein dict (point_id, code_id, ts) -> value verwandeln. Das
    dict entdoppelt, damit der Upsert keine Zeile zweimal anfasst."""
    stats = ParseStats()
    rows: dict[tuple[int, int, datetime], float] = {}
    for metering_point, entry in payload.items():
        stats.points_seen += 1
        if not isinstance(entry, dict):
            continue
        direction = str(entry.get("direction") or "").upper()
        codes = CODES_BY_DIRECTION.get(direction)
        if codes is None:
            stats.unknown_directions[direction or "?"] += 1
            continue
        point_id = point_ids.get(metering_point)
        if point_id is None:
            stats.unknown_points.add(metering_point)
            continue
        data = entry.get("data") or []
        # Ohne Lieferung fuer den Tag liefert der Energystore Nullen mit
        # qov 0 (unbekannt) fuer den ganzen Tag. Das sind keine Messwerte,
        # sie werden uebersprungen, damit keine falschen Nullen entstehen.
        if data and all(all(int(q) == 0 for q in (item.get("qov") or [])) for item in data):
            stats.points_without_delivery += 1
            stats.skipped_values += sum(len(item.get("value") or []) for item in data)
            continue
        if data:
            stats.points_with_data += 1
        for item in data:
            ts = datetime.fromtimestamp(item["ts"] / 1000, tz=TZ) + ts_shift
            stats.note_ts(ts)
            values = item.get("value") or []
            qovs = item.get("qov") or []
            for slot, code in enumerate(codes):
                if slot >= len(values):
                    break
                rows[(point_id, code_ids[code], ts)] = float(values[slot])
                stats.qov[int(qovs[slot]) if slot < len(qovs) else -1] += 1
    return rows, stats


def describe_stats(stats: ParseStats, rows: dict) -> str:
    qov = ", ".join(f"{QOV_LABELS.get(k, f'qov={k}')} {v}" for k, v in sorted(stats.qov.items()))
    span = ""
    if stats.ts_min is not None:
        span = f", {stats.ts_min:%d.%m. %H:%M} bis {stats.ts_max:%d.%m. %H:%M}"
    skipped = ""
    if stats.points_without_delivery:
        skipped = (f", {stats.points_without_delivery} ohne Lieferung übersprungen "
                   f"({stats.skipped_values} Nullen mit qov 0)")
    return (f"{stats.points_with_data}/{stats.points_seen} Zählpunkte mit Daten{skipped}, "
            f"{len(rows)} Werte{span}; {qov or 'keine Werte'}")


# --------------------------------------------------------------------------
# Datenbank
# --------------------------------------------------------------------------


def connect(dsn: str):
    import psycopg

    # wie eeg_forecast.py: Service-Dateien im Repo, sonst die Standardorte
    if (NOTEBOOKS_DIR / ".pg_service.conf").exists():
        os.environ.setdefault("PGSERVICEFILE", str(NOTEBOOKS_DIR / ".pg_service.conf"))
    if (NOTEBOOKS_DIR / ".pgpass").exists():
        os.environ.setdefault("PGPASSFILE", str(NOTEBOOKS_DIR / ".pgpass"))
    return psycopg.connect(dsn)


def load_lookups(conn) -> tuple[dict[str, int], dict[str, int]]:
    with conn.cursor() as cur:
        cur.execute("SELECT identifier, id FROM members_measurementpoint")
        point_ids = {identifier: point_id for identifier, point_id in cur.fetchall()}
        cur.execute("SELECT description, id FROM metering_metercode WHERE upper(unit) = %s", (UNIT,))
        code_ids = {description: code_id for description, code_id in cur.fetchall()}
    missing = [c for codes in CODES_BY_DIRECTION.values() for c in codes if c not in code_ids]
    if missing:
        raise ConfigError("Meter-Codes fehlen in metering_metercode: " + "; ".join(missing))
    return point_ids, code_ids


def load_db_metering_points(conn) -> list[str]:
    """Zählpunkte, die wir kennen und die nicht endgültig abgelehnt sind."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT identifier FROM members_measurementpoint
            WHERE status NOT IN ('INVALID', 'REJECTED')
            ORDER BY identifier
        """)
        return [identifier for (identifier,) in cur.fetchall()]


def last_data_day(conn) -> date | None:
    with conn.cursor() as cur:
        cur.execute("SELECT max(timestamp) FROM metering_measurement")
        (latest,) = cur.fetchone()
    return latest.astimezone(TZ).date() if latest else None


@dataclass
class WriteStats:
    inserted: int = 0
    updated: int = 0
    zeroed: int = 0


def upsert_rows(conn, rows: dict[tuple[int, int, datetime], float]) -> WriteStats:
    """Alle Zeilen in einer Transaktion: COPY in eine Temp-Tabelle, dann ein
    einziges INSERT ... ON CONFLICT (wie im Excel-Notebook). Unveränderte
    Werte werden nicht angefasst."""
    stats = WriteStats()
    if not rows:
        return stats
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TEMP TABLE tmp_measurement (
                timestamp timestamptz,
                value double precision,
                measurement_point_id bigint,
                meter_code_id bigint
            ) ON COMMIT DROP
        """)
        with cur.copy("COPY tmp_measurement (timestamp, value, measurement_point_id, meter_code_id) FROM STDIN") as copy:
            for (point_id, code_id, ts), value in rows.items():
                copy.write_row((ts, value, point_id, code_id))

        # Warnsignal: vorhandene Messwerte, die die Lieferung auf 0 setzen würde
        cur.execute("""
            SELECT count(*)
            FROM tmp_measurement t
            JOIN metering_measurement m
              ON m.measurement_point_id = t.measurement_point_id
             AND m.meter_code_id = t.meter_code_id
             AND m.timestamp = t.timestamp
            WHERE t.value = 0 AND m.value <> 0
        """)
        (stats.zeroed,) = cur.fetchone()

        cur.execute("""
            INSERT INTO metering_measurement (id, timestamp, value, measurement_point_id, meter_code_id)
            SELECT nextval('metering_measurement_id_seq'), timestamp, value, measurement_point_id, meter_code_id
            FROM tmp_measurement
            ON CONFLICT (measurement_point_id, meter_code_id, timestamp)
            DO UPDATE SET value = EXCLUDED.value
            WHERE metering_measurement.value IS DISTINCT FROM EXCLUDED.value
            RETURNING (xmax = 0) AS inserted
        """)
        for (inserted,) in cur.fetchall():
            if inserted:
                stats.inserted += 1
            else:
                stats.updated += 1
    conn.commit()
    return stats


def refresh_views(conn) -> None:
    for view in MATERIALIZED_VIEWS:
        started = time.time()
        with conn.cursor() as cur:
            cur.execute(f"REFRESH MATERIALIZED VIEW {view}")
        conn.commit()
        log(f"  {view} aufgefrischt ({time.time() - started:.0f} s)")


# --------------------------------------------------------------------------
# Verifikation gegen die DB (Schritt null vor dem ersten echten Lauf)
# --------------------------------------------------------------------------


def verify_rows(conn, first_day: date, last_day: date, rows: dict[tuple[int, int, datetime], float],
                code_ids: dict[str, int]) -> None:
    if not rows:
        log("  nichts zu vergleichen (keine Werte in der Antwort)")
        return
    point_ids = sorted({point_id for point_id, _, _ in rows})
    window_start = datetime.combine(first_day, datetime.min.time(), tzinfo=TZ) - timedelta(hours=3)
    window_end = datetime.combine(last_day + timedelta(days=1), datetime.min.time(), tzinfo=TZ) + timedelta(hours=3)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT measurement_point_id, meter_code_id, timestamp, value
            FROM metering_measurement
            WHERE timestamp >= %s AND timestamp < %s
              AND measurement_point_id = ANY(%s)
        """, (window_start, window_end, point_ids))
        # value ist numeric -> Decimal; für den Vergleich reicht float
        db = {(point_id, code_id, ts.astimezone(TZ)): float(value) for point_id, code_id, ts, value in cur.fetchall()}
    conn.rollback()

    log(f"  DB: {len(db)} Werte im Fenster, API: {len(rows)} Werte")
    print(f"  {'Versatz':>8} {'vergleichbar':>12} {'gleich':>8} {'gleich (nicht 0)':>17}")
    best = None
    for shift_min in VERIFY_SHIFTS_MIN:
        shift = timedelta(minutes=shift_min)
        comparable = equal = equal_nonzero = 0
        for (point_id, code_id, ts), value in rows.items():
            db_value = db.get((point_id, code_id, ts + shift))
            if db_value is None:
                continue
            comparable += 1
            if abs(db_value - value) < 1e-6:
                equal += 1
                if value != 0:
                    equal_nonzero += 1
        print(f"  {shift_min:>+7d}m {comparable:>12} {equal:>8} {equal_nonzero:>17}")
        if best is None or equal_nonzero > best[1]:
            best = (shift_min, equal_nonzero)
    if best and best[0] != 0:
        log(f"  ACHTUNG: beste Übereinstimmung bei Versatz {best[0]:+d} min -> --ts-shift-minutes {best[0]}")
    elif best:
        log("  Zeitstempel passen ohne Versatz")

    names = {code_id: description for description, code_id in code_ids.items()}
    print(f"  {'Meter-Code':<62} {'API kWh':>12} {'DB kWh':>12}")
    for code_id in sorted(names):
        api_sum = sum(v for (_, c, ts), v in rows.items() if c == code_id)
        db_sum = sum(v for (_, c, ts), v in db.items()
                     if c == code_id and first_day <= ts.date() <= last_day)
        if api_sum or db_sum:
            print(f"  {names[code_id]:<62} {api_sum:>12.3f} {db_sum:>12.3f}")


# --------------------------------------------------------------------------
# Ablauf
# --------------------------------------------------------------------------


def parse_day(text: str) -> date:
    return date.fromisoformat(text)


def build_days(args, conn) -> list[date]:
    yesterday = datetime.now(TZ).date() - timedelta(days=1)
    if args.verify:
        first = last = args.verify
    else:
        last = args.to_day or yesterday
        if args.from_day:
            first = args.from_day
        else:
            latest = last_data_day(conn)
            if latest is None:
                raise ConfigError("metering_measurement ist leer, bitte --from angeben")
            first = latest - timedelta(days=args.overlap_days)
            log(f"letzter Tag in der DB: {latest}, Fenster ab {first} (Überlappung {args.overlap_days} Tage)")
    if first > last:
        return []
    days = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    if len(days) > args.max_days:
        log(f"Fenster auf {args.max_days} Tage begrenzt ({days[0]} bis {days[args.max_days - 1]}), "
            f"Rest beim nächsten Lauf")
        days = days[: args.max_days]
    return days


def chunks(days: list[date], size: int) -> list[tuple[date, date]]:
    return [(days[i], days[min(i + size, len(days)) - 1]) for i in range(0, len(days), size)]


def run_forecast(script: Path) -> int:
    if not script.exists():
        log(f"Prognose übersprungen: {script} fehlt")
        return 1
    cmd = [sys.executable, str(script), "--refresh", "--days", "30", "--store"]
    log("Prognose: " + " ".join(cmd))
    return subprocess.call(cmd, cwd=script.parent)


def main() -> int:
    parser = argparse.ArgumentParser(description="Energiedaten von EEG-Faktura importieren")
    parser.add_argument("--from", dest="from_day", type=parse_day, help="erster Tag (YYYY-MM-DD)")
    parser.add_argument("--to", dest="to_day", type=parse_day, help="letzter Tag (Vorgabe: gestern)")
    parser.add_argument("--overlap-days", type=int, default=14,
                        help="ohne --from: so viele Tage vor dem letzten DB-Tag beginnen (Nachlieferungen)")
    parser.add_argument("--max-days", type=int, default=92, help="höchstens so viele Tage je Lauf")
    parser.add_argument("--chunk-days", type=int, default=1, help="Tage je API-Anfrage")
    parser.add_argument("--pause", type=float, default=5.0, help="Sekunden Pause zwischen Anfragen")
    parser.add_argument("--timeout", type=float, default=180.0, help="Sekunden je Anfrage")
    parser.add_argument("--retries", type=int, default=3, help="Wiederholungen bei Server-/Netzfehlern")
    parser.add_argument("--meteringpoint", action="append", default=[],
                        help="nur diesen Zählpunkt (mehrfach möglich)")
    parser.add_argument("--cps", choices=("db", "api"), default="db",
                        help="ohne --meteringpoint: Zählpunktliste aus der DB schicken (db, Vorgabe) "
                             "oder leer lassen und den Server wählen lassen (api)")
    parser.add_argument("--ts-shift-minutes", type=int, default=0,
                        help="Zeitstempel der API um so viele Minuten verschieben (nur nach --verify setzen)")
    parser.add_argument("--verify", type=parse_day, metavar="DAY",
                        help="diesen Tag holen und mit der DB vergleichen, nichts schreiben")
    parser.add_argument("--dry-run", action="store_true", help="holen und zählen, nichts schreiben")
    parser.add_argument("--raw-dir", type=Path, help="Antworten als JSON in dieses Verzeichnis legen")
    parser.add_argument("--metadata", action="store_true", help="nur die Zählpunkt-Metadaten ausgeben")
    parser.add_argument("--no-refresh", action="store_true", help="Materialized Views nicht auffrischen")
    parser.add_argument("--forecast", action="store_true",
                        help="nach neuen Daten eeg_forecast.py --refresh --days 30 --store starten")
    parser.add_argument("--forecast-script", type=Path,
                        default=Path(os.environ.get("EEG_FORECAST_SCRIPT", DEFAULT_FORECAST_SCRIPT)))
    args = parser.parse_args()

    if args.chunk_days < 1 or args.max_days < 1 or args.pause < 0:
        parser.error("--chunk-days/--max-days >= 1 und --pause >= 0")

    cfg = Config.from_env()
    http = dict(timeout=args.timeout, retries=args.retries, pause=max(args.pause, 1.0))
    log(f"EEG-Faktura {cfg.base_url}, Tenant {cfg.tenant}, Gemeinschaft {cfg.ec_id}, Benutzer {cfg.user}")

    if args.metadata:
        meta = fetch_metadata(cfg, **http)
        for metering_point in sorted(meta):
            entry = meta[metering_point]
            begin = datetime.fromtimestamp(entry["periodBegin"] / 1000, tz=TZ)
            end = datetime.fromtimestamp(entry["periodEnd"] / 1000, tz=TZ)
            print(f"{metering_point}  {begin:%Y-%m-%d} bis {end:%Y-%m-%d}")
        log(f"{len(meta)} Zählpunkte bei EEG-Faktura")
        return 0

    with connect(cfg.dsn) as conn:
        point_ids, code_ids = load_lookups(conn)
        conn.rollback()
        days = build_days(args, conn)
        conn.rollback()
        if not days:
            log("nichts zu holen (Fenster leer)")
            return 0
        if args.meteringpoint:
            cps, cps_label = args.meteringpoint, f"{len(args.meteringpoint)} Zählpunkte (Aufruf)"
        elif args.cps == "db":
            cps = load_db_metering_points(conn)
            conn.rollback()
            cps_label = f"{len(cps)} Zählpunkte aus der DB"
        else:
            cps, cps_label = [], "Zählpunkte laut Server"
        mode = "Vergleich" if args.verify else "Probelauf" if args.dry_run else "Import"
        log(f"{mode}: {days[0]} bis {days[-1]}, {len(days)} Tage in {len(chunks(days, args.chunk_days))} "
            f"Anfragen, Pause {args.pause:.0f} s, {cps_label}")
        if args.raw_dir:
            args.raw_dir.mkdir(parents=True, exist_ok=True)

        ts_shift = timedelta(minutes=args.ts_shift_minutes)
        total = WriteStats()
        unknown_points: set[str] = set()
        written_any = False
        for index, (first, last) in enumerate(chunks(days, args.chunk_days)):
            if index:
                time.sleep(args.pause)
            label = f"{first}" if first == last else f"{first} bis {last}"
            started = time.time()
            payload = fetch_range(cfg, first, last, cps, **http)
            elapsed = time.time() - started
            if args.raw_dir:
                (args.raw_dir / f"rawdata-{first}_{last}.json").write_text(json.dumps(payload), encoding="utf-8")
            rows, stats = rows_from_payload(payload, point_ids, code_ids, ts_shift)
            unknown_points |= stats.unknown_points
            log(f"{label}: {describe_stats(stats, rows)} ({elapsed:.1f} s)")
            if stats.unknown_directions:
                log(f"  unbekannte Richtung: {dict(stats.unknown_directions)}")
            if args.verify:
                verify_rows(conn, first, last, rows, code_ids)
            elif args.dry_run:
                pass
            else:
                write = upsert_rows(conn, rows)
                total.inserted += write.inserted
                total.updated += write.updated
                total.zeroed += write.zeroed
                written_any = written_any or bool(write.inserted or write.updated)
                log(f"  neu {write.inserted}, geändert {write.updated}, unverändert "
                    f"{len(rows) - write.inserted - write.updated}"
                    + (f", auf 0 gesetzt {write.zeroed}" if write.zeroed else ""))

        if unknown_points:
            log(f"{len(unknown_points)} Zählpunkte der API fehlen in members_measurementpoint "
                f"(übersprungen): {', '.join(sorted(unknown_points))}")
        if args.verify or args.dry_run:
            return 0

        log(f"gesamt: neu {total.inserted}, geändert {total.updated}"
            + (f", auf 0 gesetzt {total.zeroed}" if total.zeroed else ""))
        if written_any and not args.no_refresh:
            refresh_views(conn)
        elif not written_any:
            log("keine neuen Werte, Views bleiben")

    if args.forecast:
        if written_any:
            return 3 if run_forecast(args.forecast_script) else 0
        log("Prognose übersprungen (keine neuen Werte)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ConfigError, ApiError) as err:
        log(f"Abbruch: {err}")
        sys.exit(2)
    except KeyboardInterrupt:
        sys.exit(130)
