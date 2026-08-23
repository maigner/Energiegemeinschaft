#!/usr/bin/env bash
# ============================================================================
# 00 - Provisionierung: ibm.conf vom Server statt aus dem Assistenten
#
# Zero-Touch-Einrichtung (docs/ibm-setup-vereinfachung.md): der Vorstand hat
# die Anlage auf ischlstrom.org/board/openhab angelegt ("SD-Karte
# vorbereiten"); auf der Boot-Partition liegt ibm-provision.conf mit dem
# Provisionierungs-Code. Dieses Skript
#
#   1. loest den Code bei <IBM_BASE_URL>/api/ibm/provision/v1 ein und
#      bekommt alle Werte, die sonst 00-wizard.sh abfragt (Token, Tunnel-IP,
#      Cloud-Identitaet, Admin-Konto, Optionen),
#   2. erkennt das Wechselrichter-Profil, wenn der Server keines vorgibt
#      (INVERTER_TYPE leer): Netzsuche aller Profile unter ../inverters/.
#      Genau ein Treffer -> uebernehmen. Sonst Phase "wechselrichter_unklar"
#      melden und alle 5 Minuten neu suchen bzw. auf die Wahl des Vorstands
#      am Dashboard warten,
#   3. schreibt ibm.conf (chmod 600) wie der Assistent am automatischen Weg
#      (AUTO_CREATE_THING=1, Thing-UID und Items aus dem Profil).
#
# Eingabe: IBM_PROVISION_CODE (Umgebung oder /boot/firmware/ibm-provision.conf),
# IBM_BASE_URL (Vorgabe https://ischlstrom.org). Das Linux-Passwort der
# Provisionierung wird nicht in ibm.conf geschrieben, sondern nur fuer den
# laufenden Installationslauf als IBM_NEW_PASSWORD nach
# /run/ibm-provision.env exportiert (liest install-ibm.sh).
#
# Ohne Code oder ohne Serververbindung bricht das Skript ab (Exit 75 =
# spaeter erneut versuchen; das macht ibm-firstboot automatisch).
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab

EX_TEMPFAIL=75

# --- Code und Server ----------------------------------------------------------
for f in /boot/firmware/ibm-provision.conf /boot/ibm-provision.conf; do
  if [ -z "${IBM_PROVISION_CODE:-}" ] && [ -f "$f" ]; then
    # shellcheck disable=SC1090
    . "$f"
    log "Provisionierung von $f gelesen."
  fi
done
IBM_BASE_URL="${IBM_BASE_URL:-https://ischlstrom.org}"
IBM_API_BASE="$IBM_BASE_URL"
[ -n "${IBM_PROVISION_CODE:-}" ] || die "Kein Provisionierungs-Code (IBM_PROVISION_CODE bzw. ibm-provision.conf auf der Boot-Partition)."
command -v python3 >/dev/null 2>&1 || die "python3 fehlt."

# --- 1. Konfiguration abholen ---------------------------------------------------
log "Loese Provisionierungs-Code bei $IBM_BASE_URL ein ..."
response="$(provision_api "" "{\"code\":$(json_str "$IBM_PROVISION_CODE")}" || true)"
if [ -z "$response" ]; then
  warn "Server nicht erreichbar oder Code abgelehnt ($IBM_BASE_URL). Naechster Versuch spaeter."
  exit "$EX_TEMPFAIL"
fi

tmp_json="$(mktemp)"
chmod 600 "$tmp_json"
printf '%s' "$response" > "$tmp_json"
trap 'rm -f "$tmp_json"' EXIT

# Alle Schluessel aus config als Bash-Variablen uebernehmen (nur Grossbuchstaben-Namen).
eval "$(python3 - "$tmp_json" <<'PY'
import json, re, shlex, sys
data = json.load(open(sys.argv[1]))
cfg = data.get("config")
if not isinstance(cfg, dict):
    print("die 'Serverantwort ohne config'"); sys.exit(0)
for k, v in cfg.items():
    if re.fullmatch(r"[A-Z][A-Z0-9_]*", k):
        print(f"{k}={shlex.quote(str(v))}")
print(f"IBM_PROV_LINUX_PASSWORD={shlex.quote(str(data.get('linux_password', '')))}")
PY
)"
: "${IBM_STATUS_TOKEN:?Serverantwort ohne IBM_STATUS_TOKEN}"
log "Konfiguration erhalten: Anlage ${IBM_ANLAGE_NAME:-?}, Tunnel-IP ${WG_ADDRESS:-?}."
report_phase konfiguration "Konfiguration von $IBM_BASE_URL geladen."

# --- 2. Wechselrichter-Profil -----------------------------------------------------
# Netzsuche eines Profils in einer Subshell (Profil-Variablen bleiben draussen).
scan_profile() {
  local type="$1"
  ( load_profile "$type" >/dev/null 2>&1 || exit 0
    type inverter_scan_hosts >/dev/null 2>&1 || exit 0
    inverter_scan_hosts 2>/dev/null | head -n 5 ) || true
}

INVERTER_TYPE="${INVERTER_TYPE:-}"
INVERTER_HOST=""
while :; do
  if [ -n "$INVERTER_TYPE" ]; then
    [ -f "$IBM_INVERTER_DIR/$INVERTER_TYPE/profile.sh" ] \
      || die "Vom Server vorgegebenes Profil '$INVERTER_TYPE' gibt es nicht in $IBM_INVERTER_DIR."
    mapfile -t hosts < <(scan_profile "$INVERTER_TYPE")
    INVERTER_HOST="${hosts[0]:-}"
    break
  fi

  report_phase wechselrichter_suche "Suche den Wechselrichter im lokalen Netz ..."
  found_types=(); found_hosts=()
  for type in $(list_inverters); do
    mapfile -t hosts < <(scan_profile "$type")
    if [ "${#hosts[@]}" -gt 0 ]; then
      found_types+=("$type"); found_hosts+=("${hosts[0]}")
      log "Profil $type: ${hosts[*]}"
    fi
  done

  if [ "${#found_types[@]}" -eq 1 ]; then
    INVERTER_TYPE="${found_types[0]}"; INVERTER_HOST="${found_hosts[0]}"
    log "Wechselrichter erkannt: $INVERTER_TYPE ($INVERTER_HOST)"
    break
  fi

  if [ "${#found_types[@]}" -eq 0 ]; then
    msg="Kein Wechselrichter im lokalen Netz gefunden. Ist der Wechselrichter im selben Netz wie der Raspberry Pi? Profil am Dashboard setzen oder warten."
  else
    msg="Mehrere Geraete gefunden:"
    for i in "${!found_types[@]}"; do msg="$msg ${found_types[$i]} (${found_hosts[$i]})"; done
    msg="$msg. Bitte das Profil am Dashboard setzen."
  fi
  warn "$msg"
  report_phase wechselrichter_unklar "$msg"

  # Vorstand kann das Profil am Dashboard setzen; die Antwort der Meldung
  # traegt es. Sonst in 5 Minuten erneut suchen.
  INVERTER_TYPE="$(report_field inverter_type)"
  [ -n "$INVERTER_TYPE" ] && { log "Profil vom Dashboard: $INVERTER_TYPE"; continue; }
  sleep 300
done

load_profile "$INVERTER_TYPE"
if [ -z "$INVERTER_HOST" ]; then
  warn "Keine Adresse fuer $INVERTER_LABEL gefunden - das Thing wird ohne Adresse angelegt; der Netzwerk-Watchdog sucht spaeter weiter."
fi
[ -n "$INVERTER_USERNAME" ] || INVERTER_USERNAME="$INVERTER_DEFAULT_USERNAME"

# --- 3. ibm.conf schreiben ----------------------------------------------------------
umask 077
export INVERTER_TYPE INVERTER_AUTO_THING_UID INVERTER_SOC_PLACEHOLDER \
       INVERTER_BATTERY_POWER_PLACEHOLDER INVERTER_GRID_POWER_PLACEHOLDER \
       INVERTER_PV_POWER_PLACEHOLDER INVERTER_HOST INVERTER_USERNAME \
       INVERTER_HOST_THING_PREFIX IBM_API_BASE
IBM_W_FILE="$IBM_CONF" python3 - "$tmp_json" <<'PY'
import json, os, re, sys
data = json.load(open(sys.argv[1]))
cfg = {k: str(v) for k, v in data["config"].items() if re.fullmatch(r"[A-Z][A-Z0-9_]*", k)}
env = os.environ
def esc(v): return re.sub(r'([\\"$`])', r'\\\1', v)

# Vom Skript ermittelte Werte gehen vor
cfg.update({
    "INVERTER_TYPE": env["INVERTER_TYPE"],
    "INVERTER_THING_UID": env["INVERTER_AUTO_THING_UID"],
    "SOC_ITEM": env["INVERTER_SOC_PLACEHOLDER"],
    "BATTERY_POWER_ITEM": env.get("INVERTER_BATTERY_POWER_PLACEHOLDER", ""),
    "GRID_POWER_ITEM": env.get("INVERTER_GRID_POWER_PLACEHOLDER", ""),
    "PV_POWER_ITEM": env.get("INVERTER_PV_POWER_PLACEHOLDER", ""),
    "AUTO_CREATE_THING": "1",
    "INVERTER_HOST": env.get("INVERTER_HOST", ""),
    "INVERTER_USERNAME": env.get("INVERTER_USERNAME", ""),
    "INVERTER_PASSWORD": "",
    "INVERTER_HOST_THING_UID": (env.get("INVERTER_HOST_THING_PREFIX") or "") and env["INVERTER_HOST_THING_PREFIX"] + ":ibm",
    "IBM_API_BASE": env["IBM_API_BASE"],
    "IBM_PROVISIONED": "1",
})
if not cfg["INVERTER_HOST_THING_UID"]:
    cfg["INSTALL_WATCHDOG"] = "0"

order = ["INVERTER_TYPE", "INVERTER_THING_UID", "SOC_ITEM", "BATTERY_POWER_ITEM", "GRID_POWER_ITEM", "PV_POWER_ITEM",
         "AUTO_CREATE_THING", "INVERTER_HOST", "INVERTER_USERNAME", "INVERTER_PASSWORD",
         "IBM_API_BASE", "INSTALL_STATUS_PUSH", "IBM_ANLAGE_NAME", "IBM_STATUS_TOKEN"]
keys = order + sorted(k for k in cfg if k not in order)
with open(env["IBM_W_FILE"], "w") as f:
    f.write("# ============================================================================\n")
    f.write("# Konfiguration fuer das ISCHLSTROM Batteriemanagement (IBM)\n")
    f.write("# Erzeugt von 00-provision.sh (Zero-Touch-Provisionierung)\n")
    f.write("# Enthaelt Token und Zugangsdaten - nur fuer root lesbar.\n")
    f.write("# ============================================================================\n\n")
    for k in keys:
        f.write(f'{k}="{esc(cfg[k])}"\n')
PY
chmod 600 "$IBM_CONF"
log "Konfiguration geschrieben: $IBM_CONF"

# Linux-Passwort nur fuer diesen Lauf (10-change-passwords.sh liest IBM_NEW_PASSWORD).
if [ -n "${IBM_PROV_LINUX_PASSWORD:-}" ]; then
  ( umask 077; printf 'IBM_NEW_PASSWORD=%q\n' "$IBM_PROV_LINUX_PASSWORD" > "${IBM_RUN_DIR:-/run}/ibm-provision.env" )
fi

cat <<ZUSAMMENFASSUNG
[IBM]
[IBM] Provisionierung
[IBM]   Anlage         : ${IBM_ANLAGE_NAME:-?}
[IBM]   Wechselrichter : ${INVERTER_LABEL} (${INVERTER_HOST:-Adresse unbekannt})
[IBM]   Tunnel-IP      : ${WG_ADDRESS:-keine}
[IBM]   Cloud-UUID     : ${CLOUD_UUID:-keine}
[IBM]
ZUSAMMENFASSUNG
