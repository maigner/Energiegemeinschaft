#!/usr/bin/env bash
# ============================================================================
# 02b - Wechselrichter-Thing automatisch anlegen
#
# Legt Bridge- und Wechselrichter-Thing ueber die openHAB REST API an -
# das, was sonst von Hand in der Main UI passiert (Settings -> Things).
# Adresse und Zugangsdaten kommen aus ibm.conf (AUTO_CREATE_THING=1,
# INVERTER_HOST, INVERTER_USERNAME, INVERTER_PASSWORD; erfasst vom
# Assistenten). Das dafuer noetige API-Token erzeugt das Skript bei
# OH_API_TOKEN="auto" selbst ueber die Karaf-Konsole und traegt es in
# ibm.conf ein - dazu muss der Admin-Benutzer in der Main UI bereits
# angelegt sein (der einzige verbleibende UI-Schritt).
#
# Idempotent: existierende Things werden nicht angetastet.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

if [ "$AUTO_CREATE_THING" != "1" ]; then
  log "Automatisches Anlegen nicht gewuenscht (AUTO_CREATE_THING=0) - uebersprungen."
  exit 0
fi

[ -n "$INVERTER_HOST" ] || die "INVERTER_HOST fehlt in ibm.conf."
[ -n "$INVERTER_HOST_THING_PREFIX" ] \
  || die "Profil '$INVERTER_TYPE' kennt keinen Bridge-Thing-Typ (INVERTER_HOST_THING_PREFIX)."
command -v python3 >/dev/null 2>&1 || die "python3 fehlt (openHABian bringt es normalerweise mit)."

REST="http://127.0.0.1:8080/rest"
BRIDGE_TYPE="$INVERTER_HOST_THING_PREFIX"
THING_TYPE="$INVERTER_THING_PREFIX"
BRIDGE_UID="${INVERTER_HOST_THING_PREFIX}:ibm"

# --- 1. Warten, bis das Binding installiert ist ------------------------------
# 02-install-addons.sh traegt das Binding nur in addons.cfg ein; openHAB
# installiert es asynchron. Erst wenn der Thing-Typ per REST aufloesbar ist,
# koennen Things dieses Typs angelegt werden.
log "Warte auf das Binding '${INVERTER_BINDING}' (Thing-Typ ${BRIDGE_TYPE}) ..."
waited=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$REST/thing-types/$BRIDGE_TYPE" || true)" = "200" ]; do
  [ "$waited" -lt 300 ] || die "Binding nach 5 Minuten nicht verfuegbar - Status in openhab.log pruefen."
  sleep 5
  waited=$((waited + 5))
done
log "Binding ist installiert."

# --- 2. API-Token ------------------------------------------------------------
ensure_api_token || die "Ohne API-Token koennen keine Things angelegt werden - siehe Hinweise oben."

auth_curl() { curl -s -H "Authorization: Bearer $OH_API_TOKEN" "$@"; }

# --- 2b. Warten, bis der Things-Endpunkt bereit ist ---------------------------
# Waehrend openHAB noch Addons installiert, kann /rest/thing-types schon da
# sein, /rest/things aber noch fehlen - ein GET liefert dann 404, obwohl nur
# der Endpunkt (nicht das Thing) fehlt. Deshalb erst anlegen, wenn die
# Things-Liste selbst antwortet.
log "Warte auf den Things-Endpunkt der REST API ..."
waited=0
until [ "$(auth_curl -o /dev/null -w '%{http_code}' -m 5 "$REST/things" || true)" = "200" ]; do
  [ "$waited" -lt 300 ] || die "REST-Endpunkt /rest/things nach 5 Minuten nicht bereit - openhab.log pruefen."
  sleep 5
  waited=$((waited + 5))
done
log "REST API ist bereit."

# --- 3. Things anlegen -------------------------------------------------------
# create_thing <uid> <json-payload>
create_thing() {
  local uid="$1" payload="$2" code body
  code="$(auth_curl -o /dev/null -w '%{http_code}' -m 10 "$REST/things/$uid" || true)"
  case "$code" in
    200) log "Thing existiert bereits: $uid"; return 0 ;;
    404) ;;
    401|403) die "API-Token wird abgelehnt (HTTP $code)." ;;
    *) die "openHAB REST API nicht erreichbar (HTTP $code)." ;;
  esac

  local attempt
  for attempt in 1 2 3; do
    body="$(auth_curl -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' \
              -d "$payload" "$REST/things")"
    code="${body##*$'\n'}"
    if [ "$code" = "201" ] || [ "$code" = "200" ]; then
      log "Thing angelegt: $uid"
      return 0
    fi
    warn "Anlegen fehlgeschlagen (HTTP $code, Versuch $attempt/3): $uid"
    sleep 10
  done
  warn "Antwort der REST API: ${body%$'\n'*}"
  die "Thing konnte nicht angelegt werden: $uid (HTTP $code)"
}

bridge_payload="$(
  IBM_J_UID="$BRIDGE_UID" IBM_J_TYPE="$BRIDGE_TYPE" IBM_J_LABEL="$INVERTER_LABEL (Verbindung)" \
  IBM_J_HOST_PARAM="$INVERTER_HOST_PARAM" IBM_J_HOST="$INVERTER_HOST" \
  IBM_J_USER_PARAM="$INVERTER_USER_PARAM" IBM_J_USER="$INVERTER_USERNAME" \
  IBM_J_PW_PARAM="$INVERTER_PASSWORD_PARAM" IBM_J_PW="$INVERTER_PASSWORD" \
  python3 - <<'PY'
import json, os
e = os.environ
cfg = {e["IBM_J_HOST_PARAM"]: e["IBM_J_HOST"]}
if e.get("IBM_J_USER_PARAM") and e.get("IBM_J_USER"):
    cfg[e["IBM_J_USER_PARAM"]] = e["IBM_J_USER"]
if e.get("IBM_J_PW_PARAM") and e.get("IBM_J_PW"):
    cfg[e["IBM_J_PW_PARAM"]] = e["IBM_J_PW"]
print(json.dumps({
    "UID": e["IBM_J_UID"],
    "thingTypeUID": e["IBM_J_TYPE"],
    "label": e["IBM_J_LABEL"],
    "configuration": cfg,
}))
PY
)"

thing_payload="$(
  IBM_J_UID="$INVERTER_THING_UID" IBM_J_TYPE="$THING_TYPE" IBM_J_BRIDGE="$BRIDGE_UID" \
  IBM_J_LABEL="$INVERTER_LABEL" IBM_J_EXTRA="$INVERTER_THING_EXTRA_CONFIG" \
  python3 - <<'PY'
import json, os
e = os.environ
extra = e.get("IBM_J_EXTRA", "").strip()
cfg = json.loads("{" + extra + "}") if extra else {}
print(json.dumps({
    "UID": e["IBM_J_UID"],
    "thingTypeUID": e["IBM_J_TYPE"],
    "bridgeUID": e["IBM_J_BRIDGE"],
    "label": e["IBM_J_LABEL"],
    "configuration": cfg,
}))
PY
)"

create_thing "$BRIDGE_UID" "$bridge_payload"
create_thing "$INVERTER_THING_UID" "$thing_payload"

# --- 4. Auf ONLINE warten -----------------------------------------------------
log "Warte, bis der Wechselrichter ONLINE meldet ..."
waited=0
status=""
while [ "$waited" -lt 120 ]; do
  status="$(auth_curl -m 5 "$REST/things/$INVERTER_THING_UID/status" \
            | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
            | head -n1 | sed -e 's/.*"\([A-Z]*\)"$/\1/' || true)"
  [ "$status" = "ONLINE" ] && break
  sleep 5
  waited=$((waited + 5))
done

if [ "$status" = "ONLINE" ]; then
  log "Wechselrichter ist ONLINE: $INVERTER_THING_UID"
else
  warn "Thing meldet '$status' statt ONLINE ($INVERTER_THING_UID)."
  warn "Moegliche Ursachen: falsche Adresse ($INVERTER_HOST), falsche"
  warn "Zugangsdaten, Geraet im Nachtmodus. Details: Main UI -> Settings ->"
  warn "Things, oder openhab.log. Die Installation laeuft trotzdem weiter."
fi
