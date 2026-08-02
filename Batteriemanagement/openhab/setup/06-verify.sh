#!/usr/bin/env bash
# ============================================================================
# 05 - Verify: prueft, ob die Installation greift. Aendert nichts.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_openhab
load_config

problems=0
fail() { warn "$*"; problems=$((problems + 1)); }

# --- Dateien ----------------------------------------------------------------
for f in "$OPENHAB_CONF/items/ibm.items" \
         "$OPENHAB_CONF/automation/js/ibm_cloud_forecast.js" \
         "$OPENHAB_CONF/automation/js/ibm_crossover.js" \
         "$OPENHAB_CONF/automation/js/ibm_battery_control.js" \
         "$OPENHAB_CONF/automation/js/ibm_init.js"; do
  [ -f "$f" ] && log "vorhanden: $f" || fail "fehlt: $f"
done

if [ "$INSTALL_PERSISTENCE" = "1" ]; then
  for svc in mapdb rrd4j; do
    [ -f "$OPENHAB_CONF/persistence/$svc.persist" ] \
      && log "vorhanden: $OPENHAB_CONF/persistence/$svc.persist" \
      || fail "fehlt: $OPENHAB_CONF/persistence/$svc.persist"
    # Datei vorhanden heisst nicht angewendet: wurde sie geschrieben, bevor
    # der Dienst installiert war, kennt openHAB die Konfiguration nicht -
    # dann kein restoreOnStartup und keine Diagramme.
    if [ -n "$OH_API_TOKEN" ]; then
      if persistence_config_loaded "$svc"; then
        log "Persistence-Konfiguration '$svc' ist aktiv."
      else
        fail "openHAB kennt keine Persistence-Konfiguration fuer '$svc' - beheben mit: sudo $IBM_SETUP_DIR/03-install-items.sh"
      fi
    fi
  done
fi

# --- openHAB Cloud ----------------------------------------------------------
# Nur Hinweis, kein Fehler: das Secret entsteht erst, wenn das Cloud-Addon
# das erste Mal laeuft - die Installation kann einige Minuten dauern.
if [ "$INSTALL_CLOUD" = "1" ]; then
  if [ -f "$OPENHAB_USERDATA/openhabcloud/secret" ]; then
    log "openHAB Cloud eingerichtet (Secret vorhanden)."
    log "UUID und Secret anzeigen: sudo $IBM_SETUP_DIR/07-myopenhab.sh"
  else
    warn "openHAB Cloud: Secret noch nicht vorhanden - Addon noch nicht fertig"
    warn "installiert? Spaeter ausfuehren: sudo $IBM_SETUP_DIR/07-myopenhab.sh"
  fi
fi

# --- Netzwerk-Watchdog ------------------------------------------------------
if [ "$INSTALL_WATCHDOG" = "1" ]; then
  for f in "$OPENHAB_CONF/automation/js/ibm_watchdog.js" \
           "$OPENHAB_CONF/scripts/ibm_rediscover.sh" \
           "$OPENHAB_USERDATA/ibm/api_token"; do
    [ -f "$f" ] && log "vorhanden: $f" || fail "fehlt: $f"
  done

  if command -v curl >/dev/null 2>&1 && [ -n "$OH_API_TOKEN" ]; then
    status_json="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/things/$INVERTER_HOST_THING_UID/status" || true)"
    if printf '%s' "$status_json" | grep -q '"status"'; then
      log "Watchdog-Bridge $INVERTER_HOST_THING_UID: $(printf '%s' "$status_json" | grep -o '"status"[[:space:]]*:[[:space:]]*"[A-Z]*"' | head -n1 | sed -e 's/.*"\([A-Z]*\)"/\1/')"
    else
      fail "Bridge-Status per REST nicht abrufbar - Token oder Thing-UID pruefen."
    fi
  fi

  serial_file="$OPENHAB_USERDATA/ibm/inverter_serial"
  if [ -f "$serial_file" ]; then
    log "Gemerkte Seriennummer(n): $(tr '\n' ' ' < "$serial_file")"
  else
    warn "Noch keine Seriennummer gemerkt - passiert automatisch, sobald das Thing ONLINE ist."
  fi
fi

# --- Parametrisierung -------------------------------------------------------
if grep -q "$INVERTER_THING_UID" "$OPENHAB_CONF/automation/js/ibm_battery_control.js" 2>/dev/null; then
  log "Thing-UID korrekt eingesetzt: $INVERTER_THING_UID"
else
  fail "Thing-UID '$INVERTER_THING_UID' steht nicht in ibm_battery_control.js."
fi

# --- API --------------------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  for path in "/api/wolken/vorschau/v1" "/api/eeginfo/crossover/v1"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "${IBM_API_BASE}${path}" || true)"
    case "$code" in
      200) log "API OK: ${path} (HTTP $code)" ;;
      404) warn "API liefert keine Daten: ${path} (HTTP $code) - Endpunkt nicht deployed oder fuer diese Kalenderwoche keine Werte." ;;
      *)   fail "API nicht erreichbar: ${path} (HTTP $code)" ;;
    esac
  done
fi

# --- Logs -------------------------------------------------------------------
logfile="$OPENHAB_LOGDIR/openhab.log"
if [ -r "$logfile" ]; then
  echo
  log "Letzte [IBM]-Meldungen aus $logfile:"
  grep -F '[IBM]' "$logfile" | tail -n 20 || log "(noch keine - die Regeln laufen zeitgesteuert)"
  echo
  if grep -F '[IBM]' "$logfile" >/dev/null 2>&1; then
    log "Die Regeln haben bereits geloggt."
  else
    warn "Noch keine [IBM]-Meldungen. Regeln laufen zeitgesteuert - abwarten oder in der Main UI unter Rules manuell starten."
  fi
else
  warn "Logdatei nicht lesbar: $logfile (ggf. mit sudo ausfuehren)"
fi

if [ "$problems" -eq 0 ]; then
  log "Verify OK."
else
  warn "Verify abgeschlossen mit $problems Problem(en)."
  exit 1
fi
