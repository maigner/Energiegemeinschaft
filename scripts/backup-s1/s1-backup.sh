#!/bin/bash
# ============================================================================
# Naechtliches Backup auf s1 (laeuft als root, gestartet von s1-backup.timer).
#
#   1. pg_dump -Fc jeder Datenbank + pg_dumpall --globals-only (Rollen)
#   2. mongodump der openHAB-Cloud-MongoDB (Cloud-Konten der Anlagen mit
#      UUID/Secret) aus dem laufenden Container, als gzip-Archiv
#      Restore: docker exec -i <container> mongorestore --archive --gzip --drop < datei
#   3. mailcow-Backup ueber das offizielle Skript (rotiert selbst)
#   4. Config-Tarball (CONFIG_PATHS unten): Caddy, WireGuard (= Anlagen-
#      Registry), PostgreSQL, Postfix (inkl. sasl_passwd), fail2ban, ufw,
#      sshd, cron, systemd-Units, die lokalen Skripte, Keila, die Compose-
#      Verzeichnisse und alle .env/.conf mit Secrets - insbesondere die
#      website/.env mit IBM_SECRET_KEY (ohne den sind die verschluesselten
#      Anlagen-Secrets in members_openhabstatus wertlos) und die
#      signal-cli-Daten (verknuepftes Geraet). Die Tarballs enthalten also
#      Secrets im Klartext; der Heimserver, der sie spiegelt, gilt als
#      vertrauenswuerdig.
#   5. Gruppenrechte fuer PULL_GROUP, damit der Heimserver die Dateien
#      als normaler Benutzer abholen kann (pull-backups-home.sh)
#
# Rotation: Postgres/MongoDB/Config KEEP_DAYS Tage (Vorgabe 14), mailcow
# MAILCOW_KEEP_DAYS (Vorgabe 7 - jedes mailcow-Backup ist eine Vollkopie
# der Maildaten, das wird schnell gross).
# ============================================================================
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/s1}"
KEEP_DAYS="${KEEP_DAYS:-14}"
MAILCOW_KEEP_DAYS="${MAILCOW_KEEP_DAYS:-7}"
MAILCOW_DIR="${MAILCOW_DIR:-/opt/mailcow-dockerized}"
MONGO_CONTAINER="${MONGO_CONTAINER:-openhab-cloud-ischlstrom-mongodb-1}"
PULL_GROUP="${PULL_GROUP:-martin}"
DATE="$(date +%F)"

# Pfade relativ zu / fuer den Config-Tarball; fehlende werden gemeldet und
# uebersprungen (z.B. wenn ein Dienst umzieht).
CONFIG_PATHS=(
  etc/caddy etc/wireguard etc/postgresql
  etc/postfix etc/fail2ban etc/ufw etc/ssh/sshd_config.d
  etc/cron.d var/spool/cron/crontabs etc/systemd/system
  etc/default/s1-backup etc/ibm-provision.conf etc/eegfaktura-import.env
  usr/local/bin usr/local/sbin usr/local/lib/ibm-provision
  opt/keila opt/mailcow.conf
  home/martin/Container/ischlstrom/website/.env
  home/martin/Container/nextcloud-aio
  home/martin/Container/signal-cli
  home/martin/openhab-cloud/deployment/docker-compose
)

log() { echo "[s1-backup] $*"; }

rc=0
mkdir -p "$BACKUP_ROOT/postgres" "$BACKUP_ROOT/mongodb" "$BACKUP_ROOT/config" \
  "$BACKUP_ROOT/mailcow"

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

# --- openHAB Cloud (MongoDB) ------------------------------------------------
if [ "$(docker inspect -f '{{.State.Running}}' "$MONGO_CONTAINER" 2>/dev/null)" = "true" ]; then
  f="$BACKUP_ROOT/mongodb/openhab-cloud_${DATE}.archive.gz"
  docker exec "$MONGO_CONTAINER" mongodump --archive --gzip --quiet > "$f"
  log "openHAB Cloud: MongoDB -> $(basename "$f") ($(du -h "$f" | cut -f1))"
else
  log "openHAB Cloud: Container $MONGO_CONTAINER laeuft nicht - MongoDB NICHT gesichert."
  rc=1
fi

# --- mailcow ----------------------------------------------------------------
# Das mailcow-Skript verlangt, dass das Zielverzeichnis fuer "others"
# mindestens r-x hat (prueft die letzte Oktalstelle auf 5-7), sonst bricht es
# mit "is not write-able for others" ab. Die Rechte-Bereinigung unten darf
# dieses eine Verzeichnis daher nicht auf o-rwx setzen (die Dateien darin
# schon). Ein Fehler hier bricht das Skript nicht ab, damit Rotation und
# Config-Tar trotzdem laufen; der Exit-Status bleibt aber 1.
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
present=(); missing=()
for p in "${CONFIG_PATHS[@]}"; do
  if [ -e "/$p" ]; then present+=("$p"); else missing+=("$p"); fi
done
# tar-Exit 1 = "Datei hat sich waehrend des Lesens geaendert" (z.B. die
# signal-cli-SQLite) - tolerieren, alles andere ist ein Fehler.
tar --warning=no-file-changed -czf "$BACKUP_ROOT/config/config_${DATE}.tar.gz" \
  -C / "${present[@]}" || [ $? -eq 1 ]
log "Config: config_${DATE}.tar.gz geschrieben ($(du -h "$BACKUP_ROOT/config/config_${DATE}.tar.gz" | cut -f1), ${#present[@]} Pfade)."
if [ ${#missing[@]} -gt 0 ]; then
  log "Config: nicht vorhanden, uebersprungen: ${missing[*]}"
fi

# --- Rotation und Abhol-Rechte ----------------------------------------------
find "$BACKUP_ROOT/postgres" "$BACKUP_ROOT/mongodb" "$BACKUP_ROOT/config" \
  -type f -mtime +"$KEEP_DAYS" -delete

chgrp -R "$PULL_GROUP" "$BACKUP_ROOT"
chmod -R g+rX,o-rwx "$BACKUP_ROOT"
chmod 0755 "$BACKUP_ROOT/mailcow"   # siehe mailcow-Abschnitt

log "Fertig. Belegung: $(du -sh "$BACKUP_ROOT" | cut -f1), frei auf /: $(df -h / | awk 'NR==2{print $4}')"
exit "$rc"
