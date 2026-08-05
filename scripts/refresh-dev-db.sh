#!/bin/bash
# Spielt die naechtlichen s1-Dumps in die lokale Postgres des Heimservers
# ein - der Heimserver ("server") ist seit der Migration auf s1 die Dev-DB
# der Website. Laeuft auf dem Heimserver per Cron nach pull-backups-home.sh
# (Abholung 05:30, Refresh 06:00); Einrichtung siehe install-dev-db-refresh.sh.
#
# pg_restore kommt aus dem postgres:17-Image: s1 (PostgreSQL 16) dumpt im
# Archivformat 1.15, das der pg_restore 14 des Heimservers nicht lesen kann
# ("unsupported version in file header"). Der Container haengt im Host-Netz
# und bekommt "server" als Alias auf die lokale Adresse.
#
# pg_restore --clean --if-exists ersetzt alle Objekte in der bestehenden DB,
# die DB selbst bleibt - dafuer reichen die normalen DB-Benutzer, ein
# Superuser wird nicht gebraucht. Offene Verbindungen eines Dev-Servers
# stoeren nicht; sie laufen nach dem Refresh einfach weiter.
#
# Fehlerbehandlung: pg_restore meldet als Nicht-Superuser mitunter harmlose
# Fehler (klassisch: COMMENT ON EXTENSION). Ebenfalls harmlos: pg_restore 17
# setzt zu Sitzungsbeginn "SET transaction_timeout", das die 14er-Datenbank
# des Heimservers nicht kennt - eine reine Sitzungseinstellung, die Daten
# kommen trotzdem vollstaendig an. Der Lauf gilt deshalb als
# fehlgeschlagen, wenn andere "pg_restore: error:"-Zeilen auftreten oder die
# Plausibilitaetspruefung (Kerntabelle muss Zeilen haben) scheitert - dann
# Exit 1, Cron schreibt das Log nach backups-s1/refresh-dev-db.log.
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/martin/backups-s1/postgres}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"
export PGPASSFILE="${PGPASSFILE:-$HOME/.pgpass}"

server_ip="$(getent hosts server | awk '{print $1; exit}')"
[ -n "$server_ip" ] || { echo "FEHLER: Host 'server' nicht aufloesbar" >&2; exit 1; }

fail=0

refresh_db() {
    local db="$1" check_sql="$2"
    local conn="host=server user=${db} dbname=${db} sslmode=require"

    local dump
    dump="$(ls -1 "$BACKUP_DIR/${db}_"*.dump 2>/dev/null | sort | tail -1)"
    if [ -z "$dump" ]; then
        echo "FEHLER: kein Dump fuer $db in $BACKUP_DIR" >&2
        fail=1
        return
    fi

    echo "[refresh-dev-db] $db <- $(basename "$dump")"
    local out
    out="$(docker run --rm --network host --add-host "server:${server_ip}" \
        -v "$BACKUP_DIR":/dumps:ro \
        -v "$PGPASSFILE":/root/.pgpass:ro \
        -e PGPASSFILE=/root/.pgpass \
        "$PG_IMAGE" \
        pg_restore --clean --if-exists --no-owner --no-privileges \
        -d "$conn" "/dumps/$(basename "$dump")" 2>&1)"

    local errors
    errors="$(printf '%s\n' "$out" | grep '^pg_restore: error:' \
        | grep -vE 'COMMENT ON EXTENSION|must be owner of extension|unrecognized configuration parameter "transaction_timeout"' || true)"
    if [ -n "$errors" ]; then
        echo "FEHLER: pg_restore fuer $db meldet:" >&2
        printf '%s\n' "$errors" >&2
        fail=1
        return
    fi

    local count
    count="$(psql "$conn" -tAc "$check_sql")"
    if [ -z "$count" ] || [ "$count" -lt 1 ]; then
        echo "FEHLER: Plausibilitaetspruefung fuer $db fehlgeschlagen (Ergebnis: '${count}')" >&2
        fail=1
    else
        echo "[refresh-dev-db] $db ok (Pruefwert: $count)"
    fi
}

refresh_db ischlstrom_middleware "select count(*) from members_member"
refresh_db ischlstrom_authjs_website "select count(*) from users"

if [ "$fail" -ne 0 ]; then
    echo "[refresh-dev-db] $(date -Is) FEHLGESCHLAGEN" >&2
    exit 1
fi

# Produktionsdaten in der Dev-DB pseudonymisieren (DSGVO / Art. 32)
if ! "$(dirname "$0")/anonymize-dev-db.sh"; then
    echo "[refresh-dev-db] $(date -Is) FEHLGESCHLAGEN (Anonymisierung)" >&2
    exit 1
fi

echo "[refresh-dev-db] $(date -Is) fertig."
