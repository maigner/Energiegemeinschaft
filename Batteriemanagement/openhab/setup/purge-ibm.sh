#!/usr/bin/env bash
# ============================================================================
# purge-ibm.sh - entfernt das ISCHLSTROM Batteriemanagement wieder komplett
#
# Setzt die Anlage in den Zustand "frisches openHABian + Admin-Konto"
# zurueck, z. B. um die Installation erneut zu testen oder eine Anlage
# ausser Betrieb zu nehmen. Entfernt in dieser Reihenfolge:
#
#   1. Main-UI-Seiten (Overview wird aus dem Backup wiederhergestellt)
#   2. Bridge- und Wechselrichter-Thing (REST)
#   3. API-Token 'ibm' und /var/lib/openhab/ibm
#   4. Regeln, Items, Persistence-Konfiguration und mapdb-Daten
#   5. addons.cfg (Backup von vor der Installation wird wiederhergestellt)
#   6. WireGuard-Tunnel und Schluessel
#   7. sshd-Haertung und SSH-Wartungsschluessel
#   8. Konsolen-Passwort zurueck auf den openHAB-Standard (habopen)
#   9. /opt/ischlstrom selbst
#
# NICHT angetastet: das openHAB-Admin-Konto, das Linux-Passwort, die
# Regionaleinstellungen (Zeitzone/Sprache) und die myopenhab-Identitaet
# (UUID/Secret) - eine Neuinstallation verwendet sie einfach wieder.
#
#   sudo /opt/ischlstrom/openhab/setup/purge-ibm.sh
#   sudo IBM_ASSUME_YES=1 ...   # ohne Rueckfrage
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab

# ibm.conf ist fuer den Purge hilfreich, aber nicht Pflicht.
if [ -f "$IBM_CONF" ]; then
  load_config
else
  warn "ibm.conf fehlt - es wird mit Standardwerten aufgeraeumt."
  OH_API_TOKEN=""
  INVERTER_THING_UID=""
  INVERTER_HOST_THING_UID=""
fi

REST="http://127.0.0.1:8080/rest"

echo "[IBM]"
echo "[IBM] ==========================================================="
echo "[IBM]  IBM-Purge: entfernt das Batteriemanagement vollstaendig"
echo "[IBM] ==========================================================="
echo "[IBM]"
echo "[IBM] Things, Regeln, Items, Seiten, Token, WireGuard und"
echo "[IBM] /opt/ischlstrom werden geloescht. Admin-Konto, Linux-Passwort"
echo "[IBM] und Zeitzone bleiben."
confirm "Wirklich alles entfernen?" || { log "Abgebrochen."; exit 0; }

auth_curl() { curl -s -H "Authorization: Bearer $OH_API_TOKEN" "$@"; }
have_token() { case "${OH_API_TOKEN:-}" in oh.*) return 0 ;; *) return 1 ;; esac; }

# --- 1. Main-UI-Seiten --------------------------------------------------------
if have_token; then
  for pagefile in "$IBM_INVERTER_DIR/${INVERTER_TYPE:-fronius}"/page-*.json; do
    [ -f "$pagefile" ] || continue
    uid="$(basename "$pagefile" .json)"; uid="${uid#page-}"
    if [ "$uid" = "overview" ]; then
      backup="$(ls -t /var/lib/openhab/ibm/overview.page.bak-*.json 2>/dev/null | head -n1 || true)"
      if [ -n "$backup" ]; then
        code="$(auth_curl -o /dev/null -w '%{http_code}' -X PUT -H 'Content-Type: application/json' \
                  -d @"$backup" "$REST/ui/components/ui%3Apage/overview" || true)"
        log "Overview-Seite aus Backup wiederhergestellt (HTTP $code): $(basename "$backup")"
        continue
      fi
    fi
    code="$(auth_curl -o /dev/null -w '%{http_code}' -X DELETE "$REST/ui/components/ui%3Apage/$uid" || true)"
    case "$code" in
      200|204) log "Seite entfernt: $uid" ;;
      404)     log "Seite nicht vorhanden: $uid" ;;
      *)       warn "Seite '$uid' nicht entfernt (HTTP $code)." ;;
    esac
  done
else
  warn "Kein API-Token in ibm.conf - Main-UI-Seiten bleiben stehen (in der UI loeschen)."
fi

# --- 2. Things ----------------------------------------------------------------
if have_token; then
  for uid in "${INVERTER_THING_UID:-}" "${INVERTER_HOST_THING_UID:-}"; do
    [ -n "$uid" ] || continue
    code="$(auth_curl -o /dev/null -w '%{http_code}' -X DELETE "$REST/things/$uid?force=true" || true)"
    case "$code" in
      200|202|204) log "Thing entfernt: $uid" ;;
      404)         log "Thing nicht vorhanden: $uid" ;;
      *)           warn "Thing '$uid' nicht entfernt (HTTP $code)." ;;
    esac
  done
else
  warn "Kein API-Token - Things bleiben stehen (Main UI -> Settings -> Things)."
fi

# --- 3. API-Token und Arbeitsverzeichnis ---------------------------------------
out="$(console_exec "openhab:users list" 2>/dev/null || true)"
admin_user="$(printf '%s\n' "$out" | grep -i 'administrator' | head -n1 | awk '{print $1}')"
if [ -n "$admin_user" ]; then
  console_exec "openhab:users rmApiToken $admin_user ibm" >/dev/null 2>&1 \
    && log "API-Token 'ibm' von '$admin_user' widerrufen." \
    || log "Kein API-Token 'ibm' zu widerrufen."
fi
rm -rf /var/lib/openhab/ibm && log "entfernt: /var/lib/openhab/ibm"

# --- 4. Regeln, Items, Persistence ---------------------------------------------
rm -f "$OPENHAB_CONF"/automation/js/ibm_*.js \
      "$OPENHAB_CONF"/scripts/ibm_rediscover.sh \
      "$OPENHAB_CONF"/items/ibm.items \
      "$OPENHAB_CONF"/persistence/mapdb.persist \
      "$OPENHAB_CONF"/persistence/rrd4j.persist
log "Regeln, Items und Persistence-Konfiguration entfernt."
rm -rf /var/lib/openhab/persistence/mapdb /var/lib/openhab/persistence/rrd4j \
  && log "mapdb- und rrd4j-Daten entfernt."
# Der Standard-Dienst zeigt sonst auf das dann deinstallierte rrd4j.
if [ -f "$OPENHAB_CONF/services/runtime.cfg" ]; then
  sed -i '/^org\.openhab\.persistence:default=/d' "$OPENHAB_CONF/services/runtime.cfg" \
    && log "Standard-Persistence-Dienst aus runtime.cfg entfernt."
fi

# --- 5. addons.cfg -------------------------------------------------------------
oldest_bak="$(ls -tr "$OPENHAB_CONF"/services/addons.cfg.bak-* 2>/dev/null | head -n1 || true)"
if [ -n "$oldest_bak" ]; then
  mv "$oldest_bak" "$OPENHAB_CONF/services/addons.cfg"
  rm -f "$OPENHAB_CONF"/services/addons.cfg.bak-*
  log "addons.cfg aus dem aeltesten Backup wiederhergestellt - openHAB entfernt die Addons."
elif [ -f "$OPENHAB_CONF/services/addons.cfg" ]; then
  rm -f "$OPENHAB_CONF/services/addons.cfg"
  log "addons.cfg entfernt (war von der Installation angelegt)."
fi

# --- 6. WireGuard ---------------------------------------------------------------
if [ -f /etc/wireguard/wg0.conf ] || [ -f /etc/wireguard/ibm-pi.key ]; then
  systemctl disable --now wg-quick@wg0 >/dev/null 2>&1 || true
  rm -f /etc/wireguard/wg0.conf /etc/wireguard/ibm-pi.key /etc/wireguard/ibm-pi.pub
  log "WireGuard-Tunnel entfernt (Pakete bleiben installiert)."
  log "Peer-Eintrag auf dem Wartungsserver nicht vergessen (wg0.conf auf s1)."
fi

# --- 7. SSH-Haertung -------------------------------------------------------------
dropin="/etc/ssh/sshd_config.d/90-ibm-hardening.conf"
if [ -f "$dropin" ]; then
  rm -f "$dropin"
  systemctl reload-or-restart ssh 2>/dev/null || systemctl reload-or-restart sshd 2>/dev/null || true
  log "sshd-Haertung entfernt - Passwort-Anmeldung wieder moeglich."
fi
maintainer_key="$(curl -fsSL "${IBM_API_BASE:-https://ischlstrom.org}/ibm/ssh-maintainer.pub" 2>/dev/null | head -n1 || true)"
akfile="$(getent passwd "${WG_SSH_USER:-openhabian}" | cut -d: -f6)/.ssh/authorized_keys"
if [ -n "$maintainer_key" ] && [ -f "$akfile" ] && grep -qxF "$maintainer_key" "$akfile"; then
  grep -vxF "$maintainer_key" "$akfile" > "$akfile.tmp" && mv "$akfile.tmp" "$akfile"
  log "SSH-Wartungsschluessel aus authorized_keys entfernt."
fi

# --- 8. Konsolen-Passwort zurueck auf Standard -----------------------------------
up="$OPENHAB_USERDATA/etc/users.properties"
if [ -f "$up" ]; then
  stored="$(karaf_stored_password habopen)"
  sed -i -E "s|^([[:space:]]*openhab[[:space:]]*=[[:space:]]*)[^,]*|\1${stored}|" "$up"
  log "Karaf-Konsolen-Passwort zurueck auf den Standard (habopen)."
fi

# --- 9. Neustart und Selbstentfernung --------------------------------------------
log "openHAB wird neu gestartet, damit alles sauber verschwindet ..."
systemctl restart openhab.service || warn "Neustart fehlgeschlagen - bitte manuell."

rm -rf /opt/ischlstrom
log "entfernt: /opt/ischlstrom"

cat <<ENDE
[IBM]
[IBM] ===========================================================
[IBM]  Purge abgeschlossen.
[IBM] ===========================================================
[IBM]
[IBM] Uebrig geblieben (absichtlich): Admin-Konto der Main UI,
[IBM] Linux-Passwort, Zeitzone/Region, myopenhab-UUID/-Secret.
[IBM]
[IBM] Neuinstallation:
[IBM]   curl -fsSL ${IBM_API_BASE:-https://ischlstrom.org}/ibm/install.sh -o install.sh
[IBM]   sudo bash install.sh
[IBM]
ENDE
