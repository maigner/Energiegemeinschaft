#!/usr/bin/env bash
# ============================================================================
# 08 - WireGuard-Fernwartung
#
# Baut einen dauerhaften, ausgehenden WireGuard-Tunnel vom Pi zum
# Wartungsserver auf. Damit bleibt die Anlage fuer Updates und Fehlersuche
# per SSH erreichbar, ohne dass am Router des Mitglieds etwas geoeffnet
# wird (PersistentKeepalive haelt das NAT-Mapping offen; durch den Tunnel
# laeuft ausschliesslich das Wartungsnetz, nicht der Internetverkehr).
#
# Braucht in ibm.conf: INSTALL_WIREGUARD=1 und WG_ADDRESS (die eindeutige
# Tunnel-IP der Anlage, vergibt der Wartungsserver). Den Public Key des
# Servers laedt das Skript von <IBM_API_BASE>/ibm/, falls nicht in ibm.conf
# gesetzt.
#
# Die SSH-Anmeldung durch den Tunnel laeuft per PASSWORT des Benutzers
# WG_SSH_USER - deshalb das Standardpasswort aendern lassen
# (10-change-passwords.sh, INSTALL_PASSWORD_CHANGE=1). Fruehere Versionen
# stellten sshd auf Schluessel-Anmeldung um; solche Reste baut dieses
# Skript wieder zurueck.
#
# Am Ende wird der Public Key des Pi angezeigt - er muss auf dem
# Wartungsserver als Peer eingetragen werden (siehe README, Abschnitt
# "Fernwartung").
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
load_config

WG_IF="wg0"
WG_DIR="/etc/wireguard"
WG_KEY="$WG_DIR/ibm-pi.key"
WG_PUB="$WG_DIR/ibm-pi.pub"
WG_CONF="$WG_DIR/$WG_IF.conf"

if [ "$INSTALL_WIREGUARD" != "1" ]; then
  log "WireGuard-Fernwartung nicht gewuenscht (INSTALL_WIREGUARD=0) - uebersprungen."
  exit 0
fi

[ -n "$WG_ADDRESS" ] || die "WG_ADDRESS fehlt in ibm.conf (eindeutige Tunnel-IP der Anlage, z. B. 10.88.0.11)."
echo "$WG_ADDRESS" | grep -qE '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' \
  || die "WG_ADDRESS ist keine IPv4-Adresse: $WG_ADDRESS"
case "$WG_SERVER_ENDPOINT" in
  *:*) : ;;
  *) die "WG_SERVER_ENDPOINT braucht Host:Port (z. B. s1.ischlstrom.org:51820): $WG_SERVER_ENDPOINT" ;;
esac

# Nur das /24 rund um die Tunnel-IP wird durch den Tunnel geroutet -
# der normale Internetverkehr des Mitglieds bleibt unberuehrt.
WG_SUBNET="${WG_ADDRESS%.*}.0/24"

# --- WireGuard installieren -------------------------------------------------
if command -v wg >/dev/null 2>&1; then
  log "WireGuard ist bereits installiert."
else
  log "Installiere WireGuard (apt-get) ..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq || warn "apt-get update fehlgeschlagen - Installation wird trotzdem versucht."
  apt-get install -y -qq wireguard || die "WireGuard konnte nicht installiert werden."
fi

# --- Public Key des Wartungsservers -----------------------------------------
if [ -z "$WG_SERVER_PUBLIC_KEY" ]; then
  pubkey_url="$IBM_API_BASE/ibm/wg-server.pub"
  log "Lade Server-Public-Key: $pubkey_url"
  WG_SERVER_PUBLIC_KEY="$(curl -fsSL "$pubkey_url" 2>/dev/null | head -n1 | tr -d '[:space:]' || true)"
fi
[ -n "$WG_SERVER_PUBLIC_KEY" ] \
  || die "Kein Server-Public-Key: weder WG_SERVER_PUBLIC_KEY in ibm.conf noch abrufbar unter $IBM_API_BASE/ibm/wg-server.pub."
[ "${#WG_SERVER_PUBLIC_KEY}" -eq 44 ] \
  || warn "Server-Public-Key hat unerwartete Laenge (${#WG_SERVER_PUBLIC_KEY} statt 44 Zeichen)."

# --- Schluesselpaar des Pi --------------------------------------------------
mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"
if [ -s "$WG_KEY" ]; then
  log "Schluesselpaar vorhanden: $WG_KEY"
else
  (umask 077 && wg genkey > "$WG_KEY")
  log "Schluesselpaar erzeugt: $WG_KEY"
fi
(umask 077 && wg pubkey < "$WG_KEY" > "$WG_PUB")
PI_PUBLIC_KEY="$(cat "$WG_PUB")"

# --- wg0.conf ---------------------------------------------------------------
tmp="$(mktemp)"
cat > "$tmp" <<EOF
# Erzeugt von 08-install-wireguard.sh - ISCHLSTROM Fernwartung.
# Aenderungen hier gehen beim naechsten Setup-Lauf verloren.
[Interface]
Address    = ${WG_ADDRESS}/32
PrivateKey = $(cat "$WG_KEY")

[Peer]
# Wartungsserver
PublicKey           = ${WG_SERVER_PUBLIC_KEY}
Endpoint            = ${WG_SERVER_ENDPOINT}
AllowedIPs          = ${WG_SUBNET}
PersistentKeepalive = 25
EOF

changed=1
if [ -f "$WG_CONF" ] && cmp -s "$tmp" "$WG_CONF"; then
  changed=0
  log "unveraendert: $WG_CONF"
else
  if [ -f "$WG_CONF" ]; then
    cp -a "$WG_CONF" "$WG_CONF.bak-$(date +%Y%m%d%H%M%S)"
    log "Backup angelegt: $WG_CONF.bak-*"
  fi
  install -m 0600 "$tmp" "$WG_CONF"
  log "geschrieben: $WG_CONF"
fi
rm -f "$tmp"

# --- Dienst -----------------------------------------------------------------
systemctl enable "wg-quick@${WG_IF}" >/dev/null 2>&1 \
  || warn "Autostart konnte nicht aktiviert werden: systemctl enable wg-quick@${WG_IF}"
if systemctl is-active --quiet "wg-quick@${WG_IF}"; then
  if [ "$changed" = "1" ]; then
    systemctl restart "wg-quick@${WG_IF}" || die "wg-quick@${WG_IF} konnte nicht neu gestartet werden."
    log "Tunnel neu gestartet."
  else
    log "Tunnel laeuft bereits."
  fi
else
  systemctl start "wg-quick@${WG_IF}" || die "wg-quick@${WG_IF} konnte nicht gestartet werden."
  log "Tunnel gestartet."
fi

# --- Rueckbau der frueheren SSH-Haertung ------------------------------------
# Fruehere Versionen schalteten die Passwort-Anmeldung von sshd ab und
# trugen einen SSH-Wartungsschluessel (bzw. eine Benutzer-CA) ein. Die
# Fernwartung laeuft jetzt wieder per Passwort durch den Tunnel - was von
# der Haertung noch da ist, wird entfernt. Idempotent.
SSHD_DROPIN="/etc/ssh/sshd_config.d/90-ibm-hardening.conf"
SSH_CA_FILE="/etc/ssh/ibm-user-ca.pub"
if [ -f "$SSHD_DROPIN" ]; then
  rm -f "$SSHD_DROPIN"
  systemctl reload-or-restart ssh 2>/dev/null \
    || systemctl reload-or-restart sshd 2>/dev/null \
    || warn "sshd konnte nicht neu geladen werden - bitte manuell: sudo systemctl reload ssh"
  log "Fruehere sshd-Haertung entfernt - SSH-Anmeldung wieder per Passwort."
fi
rm -f "$SSH_CA_FILE" "$SSH_CA_FILE".bak-*
maintainer_key="$(curl -fsSL "$IBM_API_BASE/ibm/ssh-maintainer.pub" 2>/dev/null | head -n1 || true)"
ssh_home="$(getent passwd "$WG_SSH_USER" | cut -d: -f6 || true)"
akfile="$ssh_home/.ssh/authorized_keys"
if [ -n "$maintainer_key" ] && [ -n "$ssh_home" ] && [ -f "$akfile" ] \
   && grep -qxF "$maintainer_key" "$akfile"; then
  grep -vxF "$maintainer_key" "$akfile" > "$akfile.tmp" && mv "$akfile.tmp" "$akfile"
  log "Frueheren SSH-Wartungsschluessel aus authorized_keys entfernt."
fi

# --- Ergebnis ---------------------------------------------------------------
cat <<INFO
[IBM]
[IBM] ===========================================================
[IBM]  WireGuard eingerichtet - Peer auf dem Wartungsserver eintragen
[IBM] ===========================================================
[IBM]
[IBM] In /etc/wireguard/wg0.conf des Wartungsservers (${WG_SERVER_ENDPOINT%:*}):
[IBM]
[IBM]   [Peer]
[IBM]   # $(hostname) - ${WG_ADDRESS}
[IBM]   PublicKey  = ${PI_PUBLIC_KEY}
[IBM]   AllowedIPs = ${WG_ADDRESS}/32
[IBM]
[IBM] Danach dort neu laden (bestehende Tunnel bleiben verbunden):
[IBM]   sudo bash -c 'wg syncconf wg0 <(wg-quick strip wg0)'
[IBM]
[IBM] Zugriff vom Wartungsserver aus (Passwort-Anmeldung):
[IBM]   ssh ${WG_SSH_USER:-openhabian}@${WG_ADDRESS}
[IBM]
INFO

handshake_ok() {
  local ts
  ts="$(wg show "$WG_IF" latest-handshakes 2>/dev/null | awk '{print $2; exit}')"
  [ -n "$ts" ] && [ "$ts" -gt 0 ]
}

if handshake_ok; then
  log "Tunnel steht - Handshake mit dem Wartungsserver erfolgt."
elif [ "${IBM_ASSUME_YES:-0}" = "1" ]; then
  log "Noch kein Handshake - Peer auf dem Wartungsserver eintragen (siehe oben)."
else
  log "Noch kein Handshake - normal, solange der Peer auf dem Server noch fehlt."
  while confirm "Peer eingetragen - jetzt auf Handshake pruefen?"; do
    sleep 3
    if handshake_ok; then
      log "Tunnel steht - Handshake mit dem Wartungsserver erfolgt."
      break
    fi
    warn "Noch kein Handshake. Peer-Eintrag, Endpoint (${WG_SERVER_ENDPOINT}) und"
    warn "Firewall des Servers pruefen (UDP ${WG_SERVER_ENDPOINT##*:} muss offen sein)."
  done
fi
