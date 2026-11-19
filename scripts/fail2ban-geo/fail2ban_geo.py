#!/usr/bin/env python3
"""fail2ban-geo - fail2ban-Sperren von s1 mit Standort in die Mittelware-DB.

Laeuft auf s1 als root (fail2ban-geo.timer, alle 10 Minuten):

  1. liest die Sperren aus fail2bans eigener SQLite-Datenbank (Tabellen
     `bans` = Verlauf der letzten 24 h, danach vergisst fail2ban sie
     [dbpurgeage]; `bips` = aktuell gesperrte Adressen, darunter die
     dauerhaften des postgresql-Jails) - nur lesend,
  2. schlaegt fuer jede neue Sperre Land, Ort, Koordinaten und Netz (ASN) in
     den lokalen DB-IP-Lite-Dateien nach (fail2ban-geo-update.sh laedt sie
     monatlich) - keine Adresse verlaesst den Server,
  3. schreibt sie nach security_fail2banban (Migration security 0001) ueber
     `runuser -u postgres -- psql` am lokalen Socket: kein Passwort, und kein
     Verbindungsversuch, den das postgresql-Jail selbst sperren koennte,
  4. setzt die Adresse von Sperren, die aelter als RETENTION_DAYS (90) sind,
     auf NULL - Standort und Netz bleiben fuer die Karte auf /board/security.

Doppelte verhindert der Abgleich mit der Tabelle (jail, ip, banned_at).
Sperren, die schon aelter als die Aufbewahrung sind, kommen nur beim
allerersten Lauf (leere Tabelle) hinein: spaeter liesse sich eine bereits
anonymisierte Zeile nicht mehr wiedererkennen, und die dauerhaften Sperren
stehen ja fuer immer in `bips`.

  fail2ban_geo.py                  normaler Lauf
  fail2ban_geo.py --backfill-logs  zusaetzlich die "Ban"-Zeilen aus
                                   /var/log/fail2ban.log* nachtragen (einmalig
                                   nach der Installation, ca. vier Wochen)
  fail2ban_geo.py --dry-run        nichts schreiben, neue Sperren ausgeben
  fail2ban_geo.py --check-geo      nur die Geo-Dateien pruefen

Umgebung (optional, /etc/fail2ban-geo.conf): F2B_DB, F2B_LOG_GLOB, GEO_DIR,
DB_NAME, RETENTION_DAYS, F2BGEO_PSQL. Log: journalctl -u fail2ban-geo
"""
import argparse
import csv
import glob
import gzip
import io
import ipaddress
import os
import re
import shlex
import sqlite3
import subprocess
import sys
import time

F2B_DB = os.environ.get("F2B_DB", "/var/lib/fail2ban/fail2ban.sqlite3")
F2B_LOG_GLOB = os.environ.get("F2B_LOG_GLOB", "/var/log/fail2ban.log*")
GEO_DIR = os.environ.get("GEO_DIR", "/var/lib/fail2ban-geo")
DB_NAME = os.environ.get("DB_NAME", "ischlstrom_middleware")
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "90"))
PSQL = os.environ.get("F2BGEO_PSQL", "runuser -u postgres -- psql")

TABLE = "security_fail2banban"
CITY_FILE = "dbip-city-lite.mmdb"
ASN_FILE = "dbip-asn-lite.mmdb"
# Die Log-Zeile "Ban" entsteht kurz nach dem Zeitpunkt, den fail2ban als
# timeofban speichert (der letzte Treffer) - beim Nachtrag aus den Logs gilt
# eine Sperre derselben Adresse im selben Jail innerhalb dieser Spanne als
# dieselbe.
LOG_TOLERANCE_S = 120
GEO_MAX_AGE_DAYS = 100

JAIL_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
# 2026-11-19 08:26:13,123 fail2ban.actions        [1234]: NOTICE  [sshd] Ban 1.2.3.4
# "Restore Ban" (nach jedem fail2ban-Neustart fuer jede noch aktive Sperre)
# passt absichtlich nicht - das waeren Doppelzaehlungen.
LOG_BAN_RE = re.compile(
    r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d),\d+ fail2ban\.actions\s+\[\d+\]:\s+NOTICE\s+\[([^\]]+)\] Ban (\S+)\s*$"
)
INT32_MAX = 2**31 - 1


def log(msg):
    print(f"[fail2ban-geo] {msg}", flush=True)


def fail(msg, code=1):
    print(f"[fail2ban-geo] FEHLER: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


# --- Quellen -------------------------------------------------------------------

def normalize(jail, ip, epoch, bantime=None, bancount=None, source="db"):
    """Eine Sperre in gepruefter Form oder None, wenn Jail/Adresse/Zeit nicht
    dem erwarteten Format entsprechen (nichts davon wandert ungeprueft in SQL)."""
    if not isinstance(jail, str) or not JAIL_RE.match(jail):
        return None
    try:
        addr = ipaddress.ip_address(str(ip).strip())
        epoch = int(epoch)
    except (ValueError, TypeError):
        return None
    if epoch <= 0:
        return None

    def as_int(value):
        try:
            value = int(value)
        except (ValueError, TypeError):
            return None
        return value if -1 <= value <= INT32_MAX else None

    return {
        "jail": jail,
        "ip": str(addr),
        "addr": addr,
        "epoch": epoch,
        "bantime": as_int(bantime),
        "ban_count": as_int(bancount) or 1,
        "source": source,
    }


def read_fail2ban_db(path):
    """Alle Sperren aus `bans` und `bips`. Nur lesend geoeffnet; fail2ban
    schreibt waehrenddessen weiter, ein kurz gesperrtes File wird wiederholt."""
    last_error = None
    for attempt in range(4):
        try:
            con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)
            try:
                rows = []
                for table in ("bans", "bips"):
                    cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
                    if not {"jail", "ip", "timeofban"} <= cols:
                        continue  # Tabelle fehlt oder anderes Schema
                    bantime = "bantime" if "bantime" in cols else "NULL"
                    bancount = "bancount" if "bancount" in cols else "NULL"
                    rows += con.execute(
                        f"SELECT jail, ip, timeofban, {bantime}, {bancount} FROM {table}"
                    ).fetchall()
                return rows
            finally:
                con.close()
        except sqlite3.OperationalError as e:
            last_error = e
            time.sleep(2 + attempt * 2)
    raise RuntimeError(f"{path} nicht lesbar: {last_error}")


def read_fail2ban_logs(pattern):
    """(jail, ip, epoch) je "Ban"-Zeile aus den (auch gepackten) Logs. Die
    Zeitstempel sind Ortszeit des Servers ohne Zone - mktime rechnet sie mit
    dessen Zeitzone um."""
    out = []
    for path in sorted(glob.glob(pattern)):
        opener = gzip.open if path.endswith(".gz") else open
        try:
            with opener(path, "rt", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    if " Ban " not in line:
                        continue
                    m = LOG_BAN_RE.match(line)
                    if not m:
                        continue
                    epoch = int(time.mktime(time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")))
                    out.append((m.group(2), m.group(3), epoch))
        except OSError as e:
            log(f"Log {path} uebersprungen: {e}")
    return out


# --- Geo -----------------------------------------------------------------------

def clean(value, max_len):
    """Text aus den Geo-Dateien: keine Steuerzeichen, auf Spaltenbreite gekuerzt."""
    if not isinstance(value, str):
        return ""
    return "".join(ch for ch in value if ch.isprintable()).strip()[:max_len]


class Geo:
    def __init__(self, geo_dir):
        try:
            import maxminddb
        except ImportError:
            fail("Python-Modul maxminddb fehlt (apt install python3-maxminddb)", 2)
        self.readers = {}
        for key, name in (("city", CITY_FILE), ("asn", ASN_FILE)):
            path = os.path.join(geo_dir, name)
            if not os.path.isfile(path):
                fail(f"{path} fehlt - zuerst fail2ban-geo-update.sh ausfuehren", 2)
            # MODE_MMAP = der reine Python-Leser: die heruntergeladene Datei
            # wird als root nicht von C-Code geparst.
            self.readers[key] = maxminddb.open_database(path, maxminddb.MODE_MMAP)

    def build_epochs(self):
        return {key: int(r.metadata().build_epoch) for key, r in self.readers.items()}

    def lookup(self, ip):
        geo = {"country_code": "", "country": "", "city": "", "latitude": None,
               "longitude": None, "asn": None, "as_org": ""}
        try:
            rec = self.readers["city"].get(ip)
        except Exception:  # defekter Datensatz: Sperre trotzdem speichern
            rec = None
        if isinstance(rec, dict):
            country = rec.get("country") or {}
            code = clean(country.get("iso_code"), 2).upper()
            if re.fullmatch(r"[A-Z]{2}", code):
                geo["country_code"] = code
            names = country.get("names") or {}
            geo["country"] = clean(names.get("de") or names.get("en"), 80)
            geo["city"] = clean(((rec.get("city") or {}).get("names") or {}).get("en"), 120)
            loc = rec.get("location") or {}
            lat, lon = loc.get("latitude"), loc.get("longitude")
            if (isinstance(lat, (int, float)) and isinstance(lon, (int, float))
                    and -90 <= lat <= 90 and -180 <= lon <= 180):
                geo["latitude"], geo["longitude"] = float(lat), float(lon)
        try:
            rec = self.readers["asn"].get(ip)
        except Exception:
            rec = None
        if isinstance(rec, dict):
            asn = rec.get("autonomous_system_number")
            if isinstance(asn, int) and 0 < asn < 2**32:
                geo["asn"] = asn
            geo["as_org"] = clean(rec.get("autonomous_system_organization"), 200)
        return geo


# --- Datenbank -----------------------------------------------------------------

def psql(sql=None, stdin=None):
    cmd = shlex.split(PSQL) + ["-d", DB_NAME, "-qAt", "-F", "\t", "-v", "ON_ERROR_STOP=1"]
    if sql is not None:
        cmd += ["-c", sql]
    r = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr.strip() or r.returncode}")
    return r.stdout


def load_existing():
    """(Anzahl Zeilen, Index (jail, ip) -> Zeitpunkte der Sperren mit Adresse)."""
    if psql(f"SELECT to_regclass('public.{TABLE}') IS NOT NULL").strip() != "t":
        fail(f"Tabelle {TABLE} fehlt - Migration security 0001 einspielen "
             "(middleware/eeg: python manage.py migrate security)", 2)
    total = int(psql(f"SELECT count(*) FROM {TABLE}").strip() or 0)
    index = {}
    out = psql(f"SELECT jail, host(ip), extract(epoch FROM banned_at)::bigint "
               f"FROM {TABLE} WHERE ip IS NOT NULL")
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        try:
            key = (parts[0], str(ipaddress.ip_address(parts[1])))
            index.setdefault(key, []).append(int(parts[2]))
        except ValueError:
            continue
    return total, index


def write_bans(rows, cutoff):
    """Neue Sperren einfuegen und die Aufbewahrung anwenden, in einer
    Transaktion. Die Daten gehen als CSV ueber COPY, nie als SQL-Text."""
    script = ["BEGIN;"]
    if rows:
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        for r in rows:
            writer.writerow([
                r["jail"], r["ip"], r["epoch"],
                "" if r["bantime"] is None else r["bantime"],
                r["ban_count"], r["country_code"], r["country"], r["city"],
                "" if r["latitude"] is None else repr(r["latitude"]),
                "" if r["longitude"] is None else repr(r["longitude"]),
                "" if r["asn"] is None else r["asn"],
                r["as_org"], r["source"],
            ])
        script += [
            "CREATE TEMP TABLE f2b_new (jail text, ip inet, epoch bigint, bantime integer,"
            " ban_count integer, country_code text, country text, city text,"
            " latitude double precision, longitude double precision, asn bigint,"
            " as_org text, source text) ON COMMIT DROP;",
            "COPY f2b_new FROM STDIN WITH (FORMAT csv);",
            buf.getvalue() + "\\.",
            f"INSERT INTO {TABLE} (jail, ip, banned_at, bantime_seconds, ban_count,"
            " country_code, country, city, latitude, longitude, asn, as_org, source)"
            " SELECT jail, ip, to_timestamp(epoch), bantime, COALESCE(ban_count, 1),"
            " COALESCE(country_code, ''), COALESCE(country, ''), COALESCE(city, ''),"
            " latitude, longitude, asn, COALESCE(as_org, ''), COALESCE(source, 'db')"
            " FROM f2b_new ON CONFLICT (jail, ip, banned_at) DO NOTHING;",
        ]
    script += [
        f"UPDATE {TABLE} SET ip = NULL WHERE ip IS NOT NULL AND banned_at < to_timestamp({int(cutoff)});",
        "COMMIT;",
    ]
    psql(stdin="\n".join(script) + "\n")


# --- Ablauf --------------------------------------------------------------------

def select_new(candidates, existing, table_empty, cutoff):
    """Aus (Sperre, Toleranz)-Paaren die, die noch nicht in der Tabelle stehen.
    `existing` wird fortgeschrieben, damit auch Doppelte innerhalb des Laufs
    (bans + bips, DB + Log) nur einmal kommen."""
    new = []
    for ban, tolerance in candidates:
        if ban["epoch"] < cutoff and not table_empty:
            continue
        seen = existing.setdefault((ban["jail"], ban["ip"]), [])
        if any(abs(ban["epoch"] - t) <= tolerance for t in seen):
            continue
        seen.append(ban["epoch"])
        new.append(ban)
    return new


def main():
    ap = argparse.ArgumentParser(description="fail2ban-Sperren mit Standort in die Mittelware-DB")
    ap.add_argument("--backfill-logs", action="store_true",
                    help="zusaetzlich die Ban-Zeilen aus den fail2ban-Logs nachtragen")
    ap.add_argument("--dry-run", action="store_true", help="nichts schreiben, neue Sperren ausgeben")
    ap.add_argument("--check-geo", action="store_true", help="nur die Geo-Dateien pruefen")
    args = ap.parse_args()

    geo = Geo(GEO_DIR)
    now = time.time()
    builds = geo.build_epochs()
    if args.check_geo:
        probe = geo.lookup("8.8.8.8")
        if not probe["country_code"] or probe["asn"] is None:
            fail(f"Geo-Dateien in {GEO_DIR} liefern fuer 8.8.8.8 nichts: {probe}")
        for key, epoch in builds.items():
            log(f"{key}: Stand {time.strftime('%Y-%m-%d', time.localtime(epoch))}")
        log(f"8.8.8.8 -> {probe['country_code']} {probe['city']}, AS{probe['asn']} {probe['as_org']}")
        return
    oldest = min(builds.values())
    if now - oldest > GEO_MAX_AGE_DAYS * 86400:
        log(f"WARNUNG: Geo-Dateien sind vom {time.strftime('%Y-%m-%d', time.localtime(oldest))} "
            "- fail2ban-geo-update pruefen (journalctl -u fail2ban-geo-update)")

    candidates = []
    skipped = 0
    for row in read_fail2ban_db(F2B_DB):
        ban = normalize(*row, source="db")
        if ban:
            candidates.append((ban, 0))
        else:
            skipped += 1
    n_db = len(candidates)
    if args.backfill_logs:
        for jail, ip, epoch in read_fail2ban_logs(F2B_LOG_GLOB):
            ban = normalize(jail, ip, epoch, source="log")
            if ban:
                candidates.append((ban, LOG_TOLERANCE_S))
            else:
                skipped += 1
    # aelteste zuerst: stabile Reihenfolge der ids, DB-Zeilen vor Log-Zeilen
    candidates.sort(key=lambda c: (c[0]["source"] != "db", c[0]["epoch"]))

    total, existing = load_existing()
    cutoff = now - RETENTION_DAYS * 86400
    new = select_new(candidates, existing, total == 0, cutoff)
    for ban in new:
        ban.update(geo.lookup(ban["ip"]))

    if args.dry_run:
        for ban in new:
            when = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ban["epoch"]))
            where = ", ".join(x for x in (ban["city"], ban["country"]) if x) or "ohne Standort"
            asn = f"AS{ban['asn']} {ban['as_org']}" if ban["asn"] else "-"
            print(f"{when}\t{ban['jail']}\t{ban['ip']}\t{where}\t{asn}\t{ban['source']}")
        log(f"Probelauf: {len(new)} neue Sperren (nichts geschrieben); "
            f"{n_db} in fail2bans DB, {len(candidates) - n_db} aus den Logs, {total} in der Tabelle")
        return

    write_bans(new, cutoff)
    if new or skipped or args.backfill_logs:
        without = sum(1 for b in new if b["latitude"] is None)
        log(f"{len(new)} neue Sperren gespeichert ({without} ohne Standort); "
            f"{n_db} in fail2bans DB, {len(candidates) - n_db} aus den Logs"
            + (f", {skipped} unlesbare uebersprungen" if skipped else ""))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        fail(str(e))
