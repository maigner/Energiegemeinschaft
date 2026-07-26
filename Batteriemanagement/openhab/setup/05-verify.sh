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
  [ -f "$OPENHAB_CONF/persistence/mapdb.persist" ] \
    && log "vorhanden: $OPENHAB_CONF/persistence/mapdb.persist" \
    || fail "fehlt: $OPENHAB_CONF/persistence/mapdb.persist"
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
