#!/usr/bin/env bash
# ============================================================================
# Richtet den Provisionierungs-Abgleich AUF s1 ein (laeuft dort als root;
# vom Entwicklungsrechner aus starten mit ./install-on-s1.sh, das kopiert
# dieses Verzeichnis hoch und ruft es auf):
#
#   sudo ./setup-on-s1.sh
#
#   1. Skripte nach /usr/local/sbin bzw. /usr/local/lib/ibm-provision,
#      Konfiguration /etc/ibm-provision.conf, systemd-Unit und Timer.
#   2. /etc/wireguard/wg0.base.conf anlegen: der [Interface]-Block der
#      bestehenden wg0.conf. Die Peers kommen kuenftig aus der DB.
#   3. Bestehende Peers (pi-003, pi-007) in die DB uebernehmen: jeder
#      [Peer]-Block mit Kommentar "# <name> - <ip>" wird der Anlage mit
#      diesem Namen (members_openhabstatus.name) zugeordnet. Nicht
#      zuordenbare Peers werden gemeldet und bleiben in wg0.base.conf.
#   4. Timer aktivieren und einmal laufen lassen.
#
# Voraussetzungen: PostgreSQL lokal (peer-Auth fuer postgres), docker
# compose fuer die Cloud in CLOUD_COMPOSE_DIR, IBM_SECRET_KEY in der .env
# der Website (siehe /etc/ibm-provision.conf).
# ============================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root: sudo $0" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="${DB_NAME:-ischlstrom_middleware}"
WG_IF="${WG_IF:-wg0}"
WG_CONF="/etc/wireguard/${WG_IF}.conf"
WG_BASE="/etc/wireguard/${WG_IF}.base.conf"

log() { echo "[install] $*"; }
psql_db() { runuser -u postgres -- psql -d "$DB_NAME" -qAt -v ON_ERROR_STOP=1 "$@"; }

# --- 1. Dateien ---------------------------------------------------------------
install -m 0755 "$here/ibm-provision-sync.sh" /usr/local/sbin/ibm-provision-sync.sh
install -d -m 0755 /usr/local/lib/ibm-provision
install -m 0644 "$here/cloud-makeuser.js" /usr/local/lib/ibm-provision/cloud-makeuser.js
install -m 0644 "$here/ibm-provision-sync.service" /etc/systemd/system/ibm-provision-sync.service
install -m 0644 "$here/ibm-provision-sync.timer" /etc/systemd/system/ibm-provision-sync.timer
if [ ! -f /etc/ibm-provision.conf ]; then
  cat > /etc/ibm-provision.conf <<'CONF'
# Konfiguration von ibm-provision-sync.sh (Werte = Vorgaben)
DB_NAME=ischlstrom_middleware
WEBSITE_ENV=/home/martin/Container/ischlstrom/website/.env
CLOUD_COMPOSE_DIR=/home/martin/openhab-cloud/deployment/docker-compose
CLOUD_SERVICE=app
WG_IF=wg0
CONF
  log "/etc/ibm-provision.conf angelegt (Pfade pruefen)."
fi

# --- 2. wg0.base.conf ---------------------------------------------------------
if [ ! -f "$WG_BASE" ]; then
  [ -f "$WG_CONF" ] || { echo "$WG_CONF fehlt - WireGuard zuerst einrichten (README des IBM-Setups)." >&2; exit 1; }
  cp -a "$WG_CONF" "$WG_CONF.bak-$(date +%Y%m%d%H%M%S)"
  # [Interface]-Block bis zum ersten [Peer]
  awk '/^\[Peer\]/{exit} {print}' "$WG_CONF" > "$WG_BASE"
  chmod 0600 "$WG_BASE"
  log "$WG_BASE aus dem [Interface]-Block angelegt."
fi

# --- 3. Bestehende Peers in die DB --------------------------------------------
# Quelle: die Peers aus wg0.base.conf (beim ersten Lauf = die alte wg0.conf,
# danach die noch nicht zugeordneten) und aus dem aeltesten Backup.
# Erkannte Formen je Peer:
#   [Peer]
#   # pi-003              oder   # pi-003 - 10.88.0.11
#   PublicKey  = ...
#   AllowedIPs = 10.88.0.11/32
# Der Name ist das erste Wort des Kommentars (= members_openhabstatus.name),
# die IP kommt aus AllowedIPs. Zugeordnete Peers wandern in die DB und
# werden aus wg0.base.conf entfernt (sonst stuenden sie doppelt in der
# wg0.conf); nicht zuordenbare bleiben dort und werden gemeldet.
parse_peers() {
  awk '
    function flush() { if (pub != "") print name "\t" ip "\t" pub; name=""; ip=""; pub="" }
    /^\[Peer\]/ { flush(); inpeer=1; next }
    /^\[/ { flush(); inpeer=0; next }
    inpeer && /^#/ && name == "" { line=$0; sub(/^#[ \t]*/, "", line); split(line, p, /[ \t]/); name=p[1]; next }
    inpeer && /^[ \t]*PublicKey/ { sub(/^[^=]*=[ \t]*/, ""); pub=$0; next }
    inpeer && /^[ \t]*AllowedIPs/ { sub(/^[^=]*=[ \t]*/, ""); sub(/\/.*$/, ""); ip=$0; next }
    END { flush() }
  ' "$@"
}

oldest_backup="$(ls -1 "$WG_CONF".bak-* 2>/dev/null | sort | head -n1 || true)"
keep_peers=""
while IFS=$'\t' read -r name ip pub; do
  [ -n "$pub" ] || continue
  # schon in der DB (egal unter welchem Namen)?
  if [ "$(psql_db -c "SELECT count(*) FROM members_openhabstatus WHERE wg_public_key = '$pub'")" -gt 0 ]; then
    log "Peer ${name:-?} ($ip) ist schon in der DB."
    continue
  fi
  n=0
  if [ -n "$name" ] && [ -n "$ip" ]; then
    n="$(psql_db -c "UPDATE members_openhabstatus
                        SET wg_address = '$ip', wg_public_key = '$pub', wg_synced_at = NULL
                      WHERE name = '$name' AND wg_public_key = '' RETURNING id" | wc -l)"
  fi
  if [ "$n" -gt 0 ]; then
    log "Peer $name ($ip) in die DB uebernommen."
  else
    log "Peer '${name:-ohne Namen}' ($ip) keiner Anlage zuordenbar - bleibt in $WG_BASE; Name am Dashboard angleichen und erneut ausfuehren."
    keep_peers="${keep_peers}
[Peer]
# ${name:-unbekannt} - ${ip} (nicht in der DB)
PublicKey  = ${pub}
AllowedIPs = ${ip}/32
"
  fi
done < <( { [ -f "$WG_BASE" ] && parse_peers "$WG_BASE"; [ -n "$oldest_backup" ] && parse_peers "$oldest_backup"; } | sort -u -t$'\t' -k3,3)

# wg0.base.conf neu: [Interface]-Block + nur die nicht zuordenbaren Peers
{ awk '/^\[Peer\]/{exit} {print}' "$WG_BASE"; printf '%s' "$keep_peers"; } > "$WG_BASE.new"
chmod 0600 "$WG_BASE.new"; mv "$WG_BASE.new" "$WG_BASE"

# --- 4. Timer -----------------------------------------------------------------
systemctl daemon-reload
systemctl enable --now ibm-provision-sync.timer
systemctl start ibm-provision-sync.service || true
log "Fertig. Log: journalctl -u ibm-provision-sync -f"
