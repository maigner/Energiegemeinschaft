#!/usr/bin/env bash
# ============================================================================
# Richtet fail2ban-geo AUF s1 ein (laeuft dort als root; vom
# Entwicklungsrechner aus starten mit ./install-on-s1.sh, das kopiert die
# Dateien hoch und ruft es auf):
#
#   1. python3-maxminddb (Leser fuer die Geo-Dateien) aus den Ubuntu-Paketen
#   2. fail2ban_geo.py nach /usr/local/lib/fail2ban-geo, der Lader nach
#      /usr/local/sbin, systemd-Units
#   3. DB-IP-Lite-Dateien nach /var/lib/fail2ban-geo laden (gut 60 MB,
#      danach monatlich per Timer)
#   4. Timer aktivieren: fail2ban-geo (alle 10 min), fail2ban-geo-update
#      (monatlich am 3.)
#   5. erster Lauf mit --backfill-logs: alles aus fail2bans Datenbank plus
#      die Ban-Zeilen der rotierten Logs (rund vier Wochen)
#
# fail2ban selbst wird nicht angefasst: keine Jail-, Action- oder
# Konfigurationsaenderung, die SQLite-Datenbank wird nur gelesen.
# Voraussetzung: Migration security 0001 (Tabelle security_fail2banban).
# Wiederholbar - auch fuer Updates des Skripts.
# ============================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root: sudo $0" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB=/usr/local/lib/fail2ban-geo
GEO_DIR=/var/lib/fail2ban-geo
DB_NAME=ischlstrom_middleware

log() { echo "[install] $*"; }

# --- 1. Paket ------------------------------------------------------------------
if ! python3 -c 'import maxminddb' 2>/dev/null; then
  log "python3-maxminddb installieren"
  apt-get install -y -q python3-maxminddb
fi

# --- 2. Dateien ----------------------------------------------------------------
install -d -m 0755 "$LIB" "$GEO_DIR"
install -m 0644 "$here/fail2ban_geo.py" "$LIB/fail2ban_geo.py"
install -m 0755 "$here/fail2ban-geo-update.sh" /usr/local/sbin/fail2ban-geo-update.sh
install -m 0644 "$here/fail2ban-geo.service" /etc/systemd/system/fail2ban-geo.service
install -m 0644 "$here/fail2ban-geo.timer" /etc/systemd/system/fail2ban-geo.timer
install -m 0644 "$here/fail2ban-geo-update.service" /etc/systemd/system/fail2ban-geo-update.service
install -m 0644 "$here/fail2ban-geo-update.timer" /etc/systemd/system/fail2ban-geo-update.timer

# --- 3. Geo-Dateien ------------------------------------------------------------
/usr/local/sbin/fail2ban-geo-update.sh
python3 "$LIB/fail2ban_geo.py" --check-geo

# --- 4. Timer ------------------------------------------------------------------
systemctl daemon-reload
systemctl enable --now fail2ban-geo-update.timer

# --- 5. Erster Lauf ------------------------------------------------------------
has_table="$(runuser -u postgres -- psql -d "$DB_NAME" -qAt -c "SELECT to_regclass('public.security_fail2banban') IS NOT NULL")"
if [ "$has_table" != "t" ]; then
  log "ACHTUNG: Tabelle security_fail2banban fehlt (Migration security 0001)."
  log "Der 10-Minuten-Timer bleibt aus. Nach der Migration dieses Skript noch einmal starten."
  exit 0
fi
log "Erster Lauf (fail2bans Datenbank + Logs):"
python3 "$LIB/fail2ban_geo.py" --backfill-logs
systemctl enable --now fail2ban-geo.timer
log "Timer aktiv:"
systemctl list-timers fail2ban-geo.timer fail2ban-geo-update.timer --no-pager
log "Stand der Tabelle:"
runuser -u postgres -- psql -d "$DB_NAME" -c \
  "SELECT jail, count(*) AS sperren, count(ip) AS mit_adresse, min(banned_at)::date AS von, max(banned_at)::date AS bis
     FROM security_fail2banban GROUP BY jail ORDER BY jail"
