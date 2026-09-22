#!/bin/bash
# ============================================================================
# Naechtliches Backup auf s1 (laeuft als root, gestartet von s1-backup.timer).
#
#   1. pg_dump -Fc jeder Datenbank + pg_dumpall --globals-only (Rollen)
#   2. mailcow-Backup ueber das offizielle Skript (rotiert selbst)
#   3. Config-Tarball: /etc/caddy, /etc/wireguard (= Anlagen-Registry),
#      /etc/postgresql
#   4. Gruppenrechte fuer PULL_GROUP, damit der Heimserver die Dateien
#      als normaler Benutzer abholen kann (pull-backups-home.sh)
#
# Rotation: Postgres/Config KEEP_DAYS Tage (Vorgabe 14), mailcow
# MAILCOW_KEEP_DAYS (Vorgabe 7 - jedes mailcow-Backup ist eine Vollkopie
# der Maildaten, das wird schnell gross).
# ============================================================================
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/s1}"
KEEP_DAYS="${KEEP_DAYS:-14}"
MAILCOW_KEEP_DAYS="${MAILCOW_KEEP_DAYS:-7}"
MAILCOW_DIR="${MAILCOW_DIR:-/opt/mailcow-dockerized}"
PULL_GROUP="${PULL_GROUP:-martin}"
DATE="$(date +%F)"

log() { echo "[s1-backup] $*"; }

mkdir -p "$BACKUP_ROOT/postgres" "$BACKUP_ROOT/config" "$BACKUP_ROOT/mailcow"

# --- PostgreSQL -------------------------------------------------------------
log "PostgreSQL: Globals (Rollen/Passwoerter) ..."
runuser -u postgres -- pg_dumpall --globals-only \
  > "$BACKUP_ROOT/postgres/globals_${DATE}.sql"

for db in $(runuser -u postgres -- psql -tAc \
    "select datname from pg_database where not datistemplate order by 1"); do
  f="$BACKUP_ROOT/postgres/${db}_${DATE}.dump"
  runuser -u postgres -- pg_dump -Fc "$db" > "$f"
  log "PostgreSQL: $db -> $(basename "$f") ($(du -h "$f" | cut -f1))"
done

# --- mailcow ----------------------------------------------------------------
# Das mailcow-Skript verlangt, dass das Zielverzeichnis fuer "others"
# mindestens r-x hat (prueft die letzte Oktalstelle auf 5-7), sonst bricht es
# mit "is not write-able for others" ab. Die Rechte-Bereinigung unten darf
# dieses eine Verzeichnis daher nicht auf o-rwx setzen (die Dateien darin
# schon). Ein Fehler hier bricht das Skript nicht ab, damit Rotation und
# Config-Tar trotzdem laufen; der Exit-Status bleibt aber 1.
rc=0
if [ -x "$MAILCOW_DIR/helper-scripts/backup_and_restore.sh" ]; then
  log "mailcow: Backup (Rotation ${MAILCOW_KEEP_DAYS} Tage) ..."
  chmod 0755 "$BACKUP_ROOT/mailcow"
  if ! MAILCOW_BACKUP_LOCATION="$BACKUP_ROOT/mailcow" \
      "$MAILCOW_DIR/helper-scripts/backup_and_restore.sh" backup all \
      --delete-days "$MAILCOW_KEEP_DAYS"; then
    log "mailcow: Backup FEHLGESCHLAGEN - Rotation und Configs laufen trotzdem."
    rc=1
  fi
else
  log "mailcow: $MAILCOW_DIR nicht gefunden - uebersprungen."
fi

# --- Configs ----------------------------------------------------------------
tar -czf "$BACKUP_ROOT/config/config_${DATE}.tar.gz" -C / \
  etc/caddy etc/wireguard etc/postgresql
log "Config: config_${DATE}.tar.gz geschrieben."

# --- Rotation und Abhol-Rechte ----------------------------------------------
find "$BACKUP_ROOT/postgres" "$BACKUP_ROOT/config" -type f \
  -mtime +"$KEEP_DAYS" -delete

chgrp -R "$PULL_GROUP" "$BACKUP_ROOT"
chmod -R g+rX,o-rwx "$BACKUP_ROOT"
chmod 0755 "$BACKUP_ROOT/mailcow"   # siehe mailcow-Abschnitt

log "Fertig. Belegung: $(du -sh "$BACKUP_ROOT" | cut -f1), frei auf /: $(df -h / | awk 'NR==2{print $4}')"
exit "$rc"
