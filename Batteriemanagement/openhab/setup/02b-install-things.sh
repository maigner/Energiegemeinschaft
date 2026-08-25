#!/usr/bin/env bash
# ============================================================================
# 02b - Wechselrichter-Things automatisch anlegen
#
# Legt die Things des Wechselrichters ueber die openHAB REST API an - das,
# was sonst von Hand in der Main UI passiert (Settings -> Things). Welche
# Things das sind, bestimmt das Wechselrichter-Profil: liefert es ein
# inverter_things_json() (geordnetes JSON-Array, z. B. ein Modbus-Baum
# tcp-Bridge -> Poller -> Data-Things), wird genau dieses Manifest angelegt;
# ohne die Funktion entsteht der klassische Zwei-Thing-Baum (Bridge mit
# Adresse/Zugangsdaten + Wechselrichter-Thing).
#
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

command -v python3 >/dev/null 2>&1 || die "python3 fehlt (openHABian bringt es normalerweise mit)."

EX_TEMPFAIL=75

REST="http://127.0.0.1:8080/rest"

# --- 1. Thing-Manifest bestimmen ----------------------------------------------
# Als Funktion, weil das Manifest nach dem Passwort-Abruf (3d) noch einmal
# gebaut wird - dann steht das Passwort schon im Bridge-Thing, statt per
# REST nachgetragen werden zu muessen.
build_things_manifest() {
if type inverter_things_json >/dev/null 2>&1; then
  things_manifest="$(inverter_things_json)"
  [ -n "$things_manifest" ] || die "inverter_things_json() des Profils '$INVERTER_TYPE' liefert nichts."
else
  # Klassischer Zwei-Thing-Baum: Bridge (Adresse + Zugangsdaten) und daran
  # das Wechselrichter-Thing - das bisherige Verhalten fuer Profile ohne
  # eigenes Manifest.
  [ -n "$INVERTER_HOST_THING_PREFIX" ] \
    || die "Profil '$INVERTER_TYPE' kennt keinen Bridge-Thing-Typ (INVERTER_HOST_THING_PREFIX)."
  things_manifest="$(
    IBM_J_BRIDGE_UID="${INVERTER_HOST_THING_PREFIX}:ibm" \
    IBM_J_BRIDGE_TYPE="$INVERTER_HOST_THING_PREFIX" \
    IBM_J_LABEL="$INVERTER_LABEL" \
    IBM_J_HOST_PARAM="$INVERTER_HOST_PARAM" IBM_J_HOST="$INVERTER_HOST" \
    IBM_J_USER_PARAM="$INVERTER_USER_PARAM" IBM_J_USER="$INVERTER_USERNAME" \
    IBM_J_PW_PARAM="$INVERTER_PASSWORD_PARAM" IBM_J_PW="$INVERTER_PASSWORD" \
    IBM_J_UID="$INVERTER_THING_UID" IBM_J_TYPE="$INVERTER_THING_PREFIX" \
    IBM_J_EXTRA="$INVERTER_THING_EXTRA_CONFIG" \
    python3 - <<'PY'
import json, os
e = os.environ
bridge_cfg = {e["IBM_J_HOST_PARAM"]: e["IBM_J_HOST"]}
if e.get("IBM_J_USER_PARAM") and e.get("IBM_J_USER"):
    bridge_cfg[e["IBM_J_USER_PARAM"]] = e["IBM_J_USER"]
if e.get("IBM_J_PW_PARAM") and e.get("IBM_J_PW"):
    bridge_cfg[e["IBM_J_PW_PARAM"]] = e["IBM_J_PW"]
extra = e.get("IBM_J_EXTRA", "").strip()
thing_cfg = json.loads("{" + extra + "}") if extra else {}
print(json.dumps([
    {
        "UID": e["IBM_J_BRIDGE_UID"],
        "thingTypeUID": e["IBM_J_BRIDGE_TYPE"],
        "label": e["IBM_J_LABEL"] + " (Verbindung)",
        "configuration": bridge_cfg,
    },
    {
        "UID": e["IBM_J_UID"],
        "thingTypeUID": e["IBM_J_TYPE"],
        "bridgeUID": e["IBM_J_BRIDGE_UID"],
        "label": e["IBM_J_LABEL"],
        "configuration": thing_cfg,
    },
]))
PY
  )"
fi
}
build_things_manifest

first_thing_type="$(printf '%s' "$things_manifest" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)[0]["thingTypeUID"])')" \
  || die "Thing-Manifest des Profils '$INVERTER_TYPE' ist kein gueltiges JSON-Array."

# --- 2. Warten, bis das Binding installiert ist ------------------------------
# 02-install-addons.sh traegt das Binding nur in addons.cfg ein; openHAB
# installiert es asynchron. Erst wenn der Thing-Typ per REST aufloesbar ist,
# koennen Things dieses Typs angelegt werden.
log "Warte auf das Binding '${INVERTER_BINDING}' (Thing-Typ ${first_thing_type}) ..."
waited=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$REST/thing-types/$first_thing_type" || true)" = "200" ]; do
  [ "$waited" -lt 300 ] || die "Binding nach 5 Minuten nicht verfuegbar - Status in openhab.log pruefen."
  sleep 5
  waited=$((waited + 5))
done
log "Binding ist installiert."

# --- 3. Admin-Konto und API-Token ----------------------------------------------
# Bei der Provisionierung legt das Setup den openHAB-Admin-Benutzer selbst
# an (Karaf-Konsole) - sonst muss er in der Main UI existieren.
ensure_admin_user || warn "Admin-Konto nicht angelegt - vielleicht existiert es schon."
ensure_api_token || die "Ohne API-Token koennen keine Things angelegt werden - siehe Hinweise oben."

auth_curl() { curl -s -H "Authorization: Bearer $OH_API_TOKEN" "$@"; }

# --- 3b. Warten, bis der Things-Endpunkt bereit ist ---------------------------
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

# --- 3c. Wechselrichter-Adresse ------------------------------------------------
# Erst NACH Admin-Konto und API-Token pruefen (Standardablauf: die Karte
# laeuft zuerst im Netz des Vorstands, dort gibt es den Wechselrichter
# nicht) - so sind Main UI, Cloud-Zugang und Token auch dann komplett,
# wenn dieser Lauf hier endet. 00-provision.sh hat keine Adresse gefunden;
# erneut suchen, ohne Treffer wird der Lauf spaeter wiederholt
# (ibm-firstboot alle 10 Minuten) - beim Mitglied findet die Suche das
# Geraet und die Einrichtung laeuft von selbst zu Ende.
if [ -z "$INVERTER_HOST" ]; then
  if type inverter_scan_hosts >/dev/null 2>&1; then
    mapfile -t ibm_scan_hosts < <(inverter_scan_hosts 2>/dev/null | head -n 5 || true)
    INVERTER_HOST="${ibm_scan_hosts[0]:-}"
  fi
  if [ -n "$INVERTER_HOST" ]; then
    conf_set INVERTER_HOST "$INVERTER_HOST"
    log "Wechselrichter gefunden: $INVERTER_HOST"
    # Manifest wurde oben ohne Adresse gebaut - mit Adresse neu erzeugen,
    # indem dieser Lauf wiederholt wird (schnell, alles andere steht schon).
    exec "$0"
  elif [ "$IBM_PROVISIONED" = "1" ]; then
    report_phase wartet_auf_wechselrichter "Der Wechselrichter (${INVERTER_LABEL}) ist im lokalen Netz nicht erreichbar. Sobald der Raspberry Pi im Netz des Wechselrichters laeuft, geht die Einrichtung von selbst weiter."
    warn "Wechselrichter nicht im Netz gefunden - dieser Schritt wird spaeter wiederholt."
    exit "$EX_TEMPFAIL"
  else
    die "INVERTER_HOST fehlt in ibm.conf."
  fi
fi

# --- 3d. Wechselrichter-Passwort (Provisionierung) ------------------------------
# Braucht das Profil Zugangsdaten (GEN24) und liegen noch keine vor, holt
# der Pi sie vom Server: das Mitglied (oder der Vorstand) traegt sie auf
# ischlstrom.org ein, der Server liefert sie einmalig aus und loescht sie.
# Gewartet wird bis zu 30 Minuten je Lauf; danach Exit 75 - install-ibm.sh
# bricht dann nicht ab, sondern meldet "unvollstaendig", und ibm-firstboot
# wiederholt den Lauf. Die Things werden trotzdem schon angelegt (ohne
# Passwort kein Batterie-Zugriff, aber Messwerte); das Passwort wird beim
# naechsten Lauf ins Bridge-Thing nachgetragen.
EX_TEMPFAIL=75
password_missing=0
if [ "$IBM_PROVISIONED" = "1" ] && [ -n "$INVERTER_USER_PARAM" ] && [ -z "$INVERTER_PASSWORD" ]; then
  report_phase wartet_auf_passwort "Bitte das Passwort des Wechselrichters (${INVERTER_LABEL}, Benutzer ${INVERTER_USERNAME:-?}) im Mitgliederbereich auf ischlstrom.org eintragen."
  log "Warte auf das Wechselrichter-Passwort vom Mitgliederbereich (max. 30 Minuten) ..."
  waited=0
  while [ "$waited" -lt 1800 ]; do
    answer="$(provision_api /secret "{\"token\":$(json_str "$IBM_STATUS_TOKEN")}" || true)"
    if printf '%s' "$answer" | grep -q '"password"'; then
      eval "$(printf '%s' "$answer" | python3 -c '
import json, shlex, sys
d = json.load(sys.stdin)
print("INVERTER_USERNAME=" + shlex.quote(d.get("username") or ""))
print("INVERTER_PASSWORD=" + shlex.quote(d.get("password") or ""))')"
      [ -n "$INVERTER_USERNAME" ] || INVERTER_USERNAME="$INVERTER_DEFAULT_USERNAME"
      conf_set INVERTER_USERNAME "$INVERTER_USERNAME"
      conf_set INVERTER_PASSWORD "$INVERTER_PASSWORD"
      log "Wechselrichter-Passwort erhalten und in ibm.conf eingetragen."
      break
    fi
    sleep 120; waited=$((waited + 120))
  done
  if [ -z "$INVERTER_PASSWORD" ]; then
    warn "Noch kein Wechselrichter-Passwort - Things werden ohne Passwort angelegt."
    password_missing=1
  else
    build_things_manifest
  fi
  report_phase wechselrichter
fi

# Bridge-Thing existiert schon, Passwort erst jetzt bekannt (Wiederholungs-
# lauf): Zugangsdaten per REST nachtragen. Direkt nach dem Anlegen hat das
# Thing manchmal noch keinen Handler (das Binding registriert ihn
# asynchron) - der PUT liefert dann 500 "no handler attached"; deshalb
# mehrere Versuche. Danach wird per GET geprueft, ob Benutzer und Passwort
# wirklich im Thing stehen: ohne sie meldet das Binding "Battery control is
# not available" und die Steuerung laeuft ins Leere. Ergebnis in
# credentials_ok (1 = im Thing, 0 = fehlgeschlagen, leer = nicht noetig).
credentials_ok=""
bridge_has_credentials() {
  local uid="$1"
  auth_curl -m 10 "$REST/things/$uid" | IBM_J_USER_PARAM="$INVERTER_USER_PARAM" \
    IBM_J_PW_PARAM="$INVERTER_PASSWORD_PARAM" python3 -c '
import json, os, sys
try:
    cfg = json.load(sys.stdin).get("configuration", {})
except Exception:
    sys.exit(1)
e = os.environ
ok = bool(cfg.get(e["IBM_J_PW_PARAM"]))
if e.get("IBM_J_USER_PARAM"):
    ok = ok and bool(cfg.get(e["IBM_J_USER_PARAM"]))
sys.exit(0 if ok else 1)'
}

update_bridge_credentials() {
  local uid="${INVERTER_HOST_THING_PREFIX}:ibm" code payload attempt
  [ -n "$INVERTER_PASSWORD_PARAM" ] && [ -n "$INVERTER_HOST_THING_PREFIX" ] || return 0
  code="$(auth_curl -o /dev/null -w '%{http_code}' -m 10 "$REST/things/$uid" || true)"
  [ "$code" = "200" ] || return 0
  if bridge_has_credentials "$uid"; then
    log "Zugangsdaten stehen im Bridge-Thing: $uid"
    credentials_ok=1
    return 0
  fi
  payload="$(IBM_J_USER_PARAM="$INVERTER_USER_PARAM" IBM_J_USER="$INVERTER_USERNAME" \
             IBM_J_PW_PARAM="$INVERTER_PASSWORD_PARAM" IBM_J_PW="$INVERTER_PASSWORD" python3 -c '
import json, os
e = os.environ
cfg = {e["IBM_J_PW_PARAM"]: e["IBM_J_PW"]}
if e.get("IBM_J_USER_PARAM") and e.get("IBM_J_USER"):
    cfg[e["IBM_J_USER_PARAM"]] = e["IBM_J_USER"]
print(json.dumps(cfg))')"
  for attempt in 1 2 3 4 5 6; do
    code="$(auth_curl -o /dev/null -w '%{http_code}' -m 10 -X PUT -H 'Content-Type: application/json' \
              -d "$payload" "$REST/things/$uid/config" || true)"
    if [ "$code" = "200" ] && bridge_has_credentials "$uid"; then
      log "Zugangsdaten im Bridge-Thing nachgetragen: $uid"
      credentials_ok=1
      return 0
    fi
    warn "Zugangsdaten noch nicht im Bridge-Thing (HTTP $code, Versuch $attempt/6) - warte 10 s."
    sleep 10
  done
  warn "Zugangsdaten konnten nicht ins Bridge-Thing geschrieben werden: $uid"
  credentials_ok=0
}

# --- 4. Things anlegen -------------------------------------------------------
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

# In Manifest-Reihenfolge anlegen - Bridges stehen vor ihren Kindern.
while IFS=$'\t' read -r uid payload; do
  [ -n "$uid" ] || continue
  create_thing "$uid" "$payload"
done < <(printf '%s' "$things_manifest" | things_manifest_lines)

[ -n "$INVERTER_PASSWORD" ] && update_bridge_credentials

# --- 5. Auf ONLINE warten -----------------------------------------------------
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

if [ "$password_missing" = "1" ]; then
  warn "Wechselrichter-Passwort fehlt noch - dieser Schritt wird spaeter wiederholt."
  exit "$EX_TEMPFAIL"
fi
if [ "$credentials_ok" = "0" ]; then
  report_phase wechselrichter "Die Zugangsdaten des Wechselrichters konnten noch nicht in openHAB eingetragen werden - der Schritt wird wiederholt."
  warn "Bridge-Thing ohne Zugangsdaten - dieser Schritt wird spaeter wiederholt."
  exit "$EX_TEMPFAIL"
fi
