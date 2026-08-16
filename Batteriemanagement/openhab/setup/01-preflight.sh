#!/usr/bin/env bash
# ============================================================================
# 01 - Preflight: prueft die Voraussetzungen, aendert nichts.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_openhab
load_config

problems=0
fail() { warn "$*"; problems=$((problems + 1)); }

# --- openHAB-Dienst ---------------------------------------------------------
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet openhab.service; then
    log "openHAB-Dienst laeuft."
  else
    fail "openHAB-Dienst laeuft nicht (systemctl status openhab.service)."
  fi
else
  warn "systemctl nicht gefunden - Dienststatus nicht pruefbar."
fi

# --- Verzeichnisse ----------------------------------------------------------
for d in "$OPENHAB_CONF/items" "$OPENHAB_CONF/services" "$OPENHAB_CONF/automation"; do
  [ -d "$d" ] && log "vorhanden: $d" || log "wird angelegt: $d"
done

# --- Quellskripte -----------------------------------------------------------
control_sources=()
if [ "$IBM_CONTROL_MODE" = "adapter" ]; then
  control_sources=("$IBM_SCRIPT_DIR/$INVERTER_ADAPTER_SCRIPT" "$IBM_SCRIPT_DIR/control/core.js")
else
  control_sources=("$IBM_SCRIPT_DIR/$INVERTER_CONTROL_SCRIPT")
fi
for f in "$IBM_SCRIPT_DIR/eeg-api/cloud_forecast.js" \
         "$IBM_SCRIPT_DIR/eeg-api/crossover.js" \
         "$IBM_SCRIPT_DIR/eeg-api/ladefenster.js" \
         "${control_sources[@]}"; do
  [ -f "$f" ] && log "gefunden: $f" || fail "Quellskript fehlt: $f"
done

# --- Erreichbarkeit der ischlstrom API --------------------------------------
if command -v curl >/dev/null 2>&1; then
  for path in "/api/wolken/vorschau/v1" "/api/eeginfo/crossover/v1" "/api/eeginfo/ladefenster/v1"; do
    # curl gibt bei Verbindungsfehlern selbst "000" aus und beendet sich mit
    # einem Fehlercode - daher nur abfangen, nicht zusaetzlich ausgeben.
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "${IBM_API_BASE}${path}" || true)"
    case "$code" in
      200) log "API erreichbar: ${IBM_API_BASE}${path} (HTTP $code)" ;;
      404) warn "API liefert keine Daten: ${path} (HTTP $code) - Endpunkt nicht deployed oder fuer diese Kalenderwoche keine Werte." ;;
      *)   fail "API nicht erreichbar: ${IBM_API_BASE}${path} (HTTP $code)" ;;
    esac
  done
else
  warn "curl nicht installiert - API-Erreichbarkeit nicht pruefbar."
fi

# --- Wechselrichter-Thing ---------------------------------------------------
things_db="$OPENHAB_USERDATA/jsondb/org.openhab.core.thing.Thing.json"
if [ -f "$things_db" ]; then
  if grep -q "$INVERTER_THING_UID" "$things_db"; then
    log "Thing gefunden: $INVERTER_THING_UID"
  elif [ "$AUTO_CREATE_THING" = "1" ]; then
    log "Thing '$INVERTER_THING_UID' existiert noch nicht - legt 02b-install-things.sh an."
  else
    fail "Thing '$INVERTER_THING_UID' nicht in der JSONDB. Wechselrichter in der Main UI anlegen und den Assistenten erneut ausfuehren."
  fi
else
  warn "JSONDB nicht gefunden ($things_db) - Thing nicht pruefbar."
fi

# --- SoC-Item ---------------------------------------------------------------
items_db="$OPENHAB_USERDATA/jsondb/org.openhab.core.items.Item.json"
if [ -f "$items_db" ]; then
  if grep -q "\"$SOC_ITEM\"" "$items_db"; then
    log "Ladestands-Item gefunden: $SOC_ITEM"
  elif [ "$AUTO_CREATE_THING" = "1" ] \
       || grep -qE "[[:space:]]${SOC_ITEM}[[:space:]]" "$OPENHAB_CONF/items/ibm.items" 2>/dev/null; then
    log "Ladestands-Item '$SOC_ITEM' kommt aus ibm.items (automatische Einrichtung)."
  else
    fail "Ladestands-Item '$SOC_ITEM' nicht gefunden. Channel '${INVERTER_SOC_CHANNEL}' in der Main UI mit einem Item verknuepfen."
  fi

  # Kollision: von IBM verwaltete Items duerfen nicht zusaetzlich in der
  # JSONDB (Main UI) existieren, sonst streiten sich Datei und UI.
  for item in Schalte_ISCHLSTROM_Empfehlung_einaus \
              Ischlstrom_Wolkenvorschau \
              Ischlstrom_Wolkenvorschau_Zeit \
              Ischlstrom_Crossover_Start \
              Ischlstrom_Crossover_Ende \
              Ischlstrom_Ladesperre_Start \
              Ischlstrom_Ladesperre_Ende \
              Ischlstrom_Ladesperre_Datum \
              Ischlstrom_Ladesperre_Individuell \
              Ischlstrom_Nachtbudget \
              Ischlstrom_Nachtbudget_Zeit \
              IBM_MIN_BATTERY_CHARGE \
              Minimale_Entladeleistung_Batterieeinspeisung \
              Maximale_Entladeleistung_Batterieeinspeisung \
              IBM_PAUSE_TAGE \
              IBM_LADESPERRE_AKTIV \
              IBM_LADESPERRE_WOLKEN_SCHWELLE \
              IBM_ENTLADUNG_AKTIV \
              IBM_DYNAMISCHE_LEISTUNG \
              IBM_BATTERIE_KAPAZITAET \
              IBM_KAPAZITAET_MESSUNG \
              IBM_LADESPERRE_LOKAL \
              IBM_LADELEISTUNG \
              IBM_LADERATE_MESSUNG \
              IBM_LADESPERRE_LOKAL_ENDE \
              IBM_LADEREGELUNG \
              IBM_LADEREGELUNG_SOLL \
              IBM_LADEREGELUNG_STATUS \
              IBM_HAUSLAST \
              IBM_HAUSLAST_MESSUNG \
              IBM_NACHT_ZIEL \
              IBM_BATTERIE_NETZEINSPEISUNG; do
    if grep -q "\"$item\"" "$items_db"; then
      fail "Item '$item' existiert bereits in der Main UI und wuerde mit $OPENHAB_CONF/items/ibm.items kollidieren - bitte in der UI loeschen."
    fi
  done

  # Bei der automatischen Einrichtung kommen auch die Batterie-Items aus
  # ibm.items - gleichnamige UI-Items wuerden genauso kollidieren. Profile
  # mit eigener Item-Liste (inverter_battery_items) koennen weitere Items
  # mitbringen (z. B. Modbus-Steuerregister); deren Namen stehen in der
  # zweiten Spalte der .items-Zeilen.
  if [ "$AUTO_CREATE_THING" = "1" ]; then
    battery_item_names="$SOC_ITEM
${BATTERY_POWER_ITEM:-}
${GRID_POWER_ITEM:-}"
    if type inverter_battery_items >/dev/null 2>&1; then
      battery_item_names="$battery_item_names
$(inverter_battery_items | awk '$1 ~ /^(Number|Switch|String|Dimmer|Contact|DateTime|Group)/ {print $2}')"
    fi
    while IFS= read -r item; do
      [ -n "$item" ] || continue
      if grep -q "\"$item\"" "$items_db"; then
        fail "Item '$item' existiert bereits in der Main UI und wuerde mit $OPENHAB_CONF/items/ibm.items kollidieren - bitte in der UI loeschen."
      fi
    done <<< "$(printf '%s\n' "$battery_item_names" | sort -u)"
  fi
fi

# --- Netzwerk-Watchdog ------------------------------------------------------
if [ "$INSTALL_WATCHDOG" = "1" ]; then
  src="$IBM_SCRIPT_DIR/${INVERTER_REDISCOVER_SCRIPT:-}"
  if [ -z "$INVERTER_REDISCOVER_SCRIPT" ] || [ ! -f "$src" ]; then
    fail "Netzwerksuche fehlt im Profil '$INVERTER_TYPE': ${src}"
  else
    log "gefunden: $src"
  fi

  [ -n "$INVERTER_HOST_THING_UID" ] || fail "INVERTER_HOST_THING_UID fehlt in ibm.conf (Watchdog)."
  [ -n "$OH_API_TOKEN" ] || fail "OH_API_TOKEN fehlt in ibm.conf (Watchdog)."

  if [ -f "$things_db" ] && [ -n "$INVERTER_HOST_THING_UID" ]; then
    if grep -q "$INVERTER_HOST_THING_UID" "$things_db"; then
      log "Bridge-Thing gefunden: $INVERTER_HOST_THING_UID"
    elif [ "$AUTO_CREATE_THING" = "1" ]; then
      log "Bridge-Thing '$INVERTER_HOST_THING_UID' existiert noch nicht - legt 02b-install-things.sh an."
    else
      fail "Bridge-Thing '$INVERTER_HOST_THING_UID' nicht in der JSONDB."
    fi
  fi

  for cmd in ip flock xargs seq curl; do
    command -v "$cmd" >/dev/null 2>&1 || fail "Kommando fehlt fuer den Watchdog: $cmd"
  done

  # Token gegen die REST API pruefen (Thing-Endpunkte brauchen Admin-Rechte).
  if [ "$OH_API_TOKEN" = "auto" ]; then
    log "API-Token wird bei der Installation automatisch erzeugt - Pruefung uebersprungen."
  elif command -v curl >/dev/null 2>&1 && [ -n "$OH_API_TOKEN" ] && [ -n "$INVERTER_HOST_THING_UID" ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
      -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/things/$INVERTER_HOST_THING_UID" || true)"
    case "$code" in
      200)     log "API-Token OK - Bridge-Thing per REST erreichbar." ;;
      401|403) fail "API-Token wird abgelehnt (HTTP $code) - Token eines Admin-Benutzers eintragen." ;;
      404)     fail "Bridge-Thing per REST nicht gefunden (HTTP 404): $INVERTER_HOST_THING_UID" ;;
      *)       warn "openHAB REST API nicht pruefbar (HTTP $code) - laeuft openHAB?" ;;
    esac
  fi
fi

# --- Main-UI-Seiten ---------------------------------------------------------
if [ "$INSTALL_OVERVIEW" = "1" ]; then
  ov="$IBM_INVERTER_DIR/$INVERTER_TYPE/page-overview.json"
  if [ -f "$ov" ]; then
    log "gefunden: $ov"
  else
    fail "Main-UI-Seiten fehlen: $ov - Paket mit aktuellem build-dist.sh gebaut?"
  fi
  [ -n "$OH_API_TOKEN" ] || fail "OH_API_TOKEN fehlt in ibm.conf (Overview-Seite)."

  if [ "$OH_API_TOKEN" = "auto" ]; then
    log "API-Token wird bei der Installation automatisch erzeugt - Pruefung uebersprungen."
  elif command -v curl >/dev/null 2>&1 && [ -n "$OH_API_TOKEN" ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
      -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/ui/components/ui%3Apage" || true)"
    case "$code" in
      200)     log "API-Token OK - UI-Seiten per REST erreichbar." ;;
      401|403) fail "API-Token wird abgelehnt (HTTP $code) - Token eines Admin-Benutzers eintragen." ;;
      *)       warn "openHAB REST API nicht pruefbar (HTTP $code) - laeuft openHAB?" ;;
    esac
  fi
fi

# --- Ergebnis ---------------------------------------------------------------
if [ "$problems" -eq 0 ]; then
  log "Preflight OK - keine Probleme gefunden."
else
  warn "Preflight abgeschlossen mit $problems Problem(en) - siehe oben."
  exit 1
fi
