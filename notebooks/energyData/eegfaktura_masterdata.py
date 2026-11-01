#!/usr/bin/env python3
"""Stammdaten der Zählpunkte täglich von EEG-Faktura holen.

Das Backend liefert unter `GET /api/master/masterdata` (Basic-Auth wie der
Energystore, aber Standard-Base64; Header `X-Tenant`) je Teilnehmer die
Zählpunkte mit Status, Richtung und Aktivierungsfenster (`activeSince`,
`inactiveSince`). Diese Werte landen in `members_measurementpoint`
(`status`, `type`, `activated_at`, `deactivated_at`), damit die
Abrechnungsprüfung der Website (`/board/energy/pruefung`) ohne Excel-Export
mit aktuellen Fenstern rechnet.

Was die API nicht liefert: E-Mail, Adresse, Tarifname. Neue Mitglieder und
Tarife kommen deshalb weiter über das Masterdata-Sheet (Nextcloud, Import
auf /board/members); dieses Skript legt nichts an und löscht nichts, es
aktualisiert nur bekannte Zählpunkte und meldet unbekannte.

Ein Keycloak-Passwort-Grant für den Excel-Export ist nicht möglich (der
Client `at.ourproject.vfeeg.app` erlaubt keine Direct Access Grants, Stand
2026-11-01); deshalb JSON statt xlsx.

Zugangsdaten wie eegfaktura_import.py (notebooks/.env oder Umgebung):
FAKTURA_USER, FAKTURA_PASSWORD, RC_NUMBER; optional FAKTURA_API_URL
(Vorgabe https://eegfaktura.at/api) und EEG_DB_DSN.

    python eegfaktura_masterdata.py --dry-run     # holen, vergleichen, nichts schreiben
    python eegfaktura_masterdata.py               # holen und Zählpunkte aktualisieren
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eegfaktura_import import (  # noqa: E402
    ApiError, ConfigError, DEFAULT_DSN, connect, load_dotenv_files, log,
)

TZ = ZoneInfo("Europe/Vienna")
DEFAULT_API_URL = "https://eegfaktura.at/api"
OPEN_END_YEAR = 2999


@dataclass
class MeterWindow:
    identifier: str
    participant_number: str
    status: str
    direction: str
    activated: date | None
    deactivated: date | None


def api_date(value) -> date | None:
    """RFC3339 der API als Datum in Europe/Vienna; Nullwert (Jahr 1) und
    offene Enden (Jahr >= 2999) ergeben None."""
    if not value or not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.year <= 1 or moment.year >= OPEN_END_YEAR:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=TZ)
    return moment.astimezone(TZ).date()


def fetch_masterdata(user: str, password: str, tenant: str, api_url: str, timeout: float) -> list:
    cred = base64.b64encode(f"{user}:{password}".encode()).decode()
    req = urllib.request.Request(
        f"{api_url.rstrip('/')}/master/masterdata",
        headers={"Authorization": f"Basic {cred}", "X-Tenant": tenant, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as err:
        raise ApiError(f"HTTP {err.code} beim Laden der Stammdaten: {err.read()[:200]!r}") from err
    except urllib.error.URLError as err:
        raise ApiError(f"Stammdaten nicht erreichbar: {err.reason}") from err


def windows_from_payload(payload: list) -> list[MeterWindow]:
    windows: list[MeterWindow] = []
    for participant in payload:
        if not isinstance(participant, dict):
            continue
        number = str(participant.get("participantNumber") or "").strip()
        for meter in participant.get("meters") or []:
            identifier = str(meter.get("meteringPoint") or "").strip()
            if not identifier:
                continue
            windows.append(MeterWindow(
                identifier=identifier,
                participant_number=number,
                status=str(meter.get("status") or "").strip().upper(),
                direction=str(meter.get("direction") or "").strip().upper(),
                activated=api_date(meter.get("activeSince")),
                deactivated=api_date(meter.get("inactiveSince")),
            ))
    return windows


def apply_windows(conn, windows: list[MeterWindow], dry_run: bool) -> dict:
    """Bekannte Zählpunkte aktualisieren; unbekannte und bei uns aktive, die
    die API nicht kennt, nur melden."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT mp.identifier, mp.status, mp.type, mp.activated_at, mp.deactivated_at, m.identifier
            FROM members_measurementpoint mp JOIN members_member m ON m.id = mp.member_id
        """)
        db = {row[0]: row for row in cur.fetchall()}
    changed: list[str] = []
    moved: list[str] = []
    unknown: list[str] = []
    for w in windows:
        row = db.get(w.identifier)
        if row is None:
            unknown.append(w.identifier)
            continue
        if str(row[5]) != w.participant_number:
            moved.append(f"{w.identifier} (DB Mitglied {row[5]}, EEG-Faktura {w.participant_number})")
        if (row[1], row[2], row[3], row[4]) != (w.status, w.direction, w.activated, w.deactivated):
            changed.append(w.identifier)
            if not dry_run:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE members_measurementpoint
                           SET status = %s, type = %s, activated_at = %s, deactivated_at = %s
                         WHERE identifier = %s
                    """, (w.status, w.direction, w.activated, w.deactivated, w.identifier))
    api_ids = {w.identifier for w in windows}
    missing = [ident for ident, row in db.items() if row[1] == "ACTIVE" and ident not in api_ids]
    if dry_run:
        conn.rollback()
    else:
        conn.commit()
    return {"changed": changed, "moved": moved, "unknown": unknown, "missing_active": missing}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="holen und vergleichen, nichts schreiben")
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--raw", type=Path, help="Antwort als JSON in diese Datei legen")
    args = parser.parse_args()

    load_dotenv_files()
    user = os.environ.get("FAKTURA_USER", "").strip()
    password = os.environ.get("FAKTURA_PASSWORD") or os.environ.get("PASSWORD") or ""
    tenant = os.environ.get("RC_NUMBER", "").strip()
    if not user or not password or not tenant:
        raise ConfigError("FAKTURA_USER, FAKTURA_PASSWORD und RC_NUMBER fehlen")
    api_url = os.environ.get("FAKTURA_API_URL", DEFAULT_API_URL)
    dsn = os.environ.get("EEG_DB_DSN", DEFAULT_DSN)

    log(f"Stammdaten von {api_url}, Tenant {tenant}, Benutzer {user}")
    payload = fetch_masterdata(user, password, tenant, api_url, args.timeout)
    if args.raw:
        args.raw.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    windows = windows_from_payload(payload)
    log(f"{len(payload)} Teilnehmer, {len(windows)} Zählpunkte laut EEG-Faktura")

    with connect(dsn) as conn:
        result = apply_windows(conn, windows, args.dry_run)
    mode = "würde ändern" if args.dry_run else "geändert"
    log(f"{mode}: {len(result['changed'])} Zählpunkte (Status, Richtung oder Fenster)")
    if result["unknown"]:
        log(f"{len(result['unknown'])} Zählpunkte von EEG-Faktura fehlen in members_measurementpoint "
            f"(Masterdata-Sheet importieren): {', '.join(sorted(result['unknown']))}")
    if result["moved"]:
        log(f"{len(result['moved'])} Zählpunkte stehen bei EEG-Faktura unter einer anderen Mitgliedsnummer "
            f"(Masterdata-Sheet importieren): {'; '.join(result['moved'])}")
    if result["missing_active"]:
        log(f"{len(result['missing_active'])} bei uns ACTIVE, bei EEG-Faktura nicht vorhanden: "
            f"{', '.join(sorted(result['missing_active']))}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ConfigError, ApiError) as err:
        log(f"Abbruch: {err}")
        sys.exit(2)
