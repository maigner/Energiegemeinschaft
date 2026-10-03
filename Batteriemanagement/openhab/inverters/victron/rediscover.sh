#!/usr/bin/env bash
# ============================================================================
# IBM - Netzwerksuche Victron Energy (GX-Geraet)
#
# Findet das GX-Geraet im lokalen Netz wieder, wenn der Router ihm per DHCP
# eine neue IP zugeteilt hat, und traegt die neue Adresse ueber die openHAB
# REST API in die Modbus-TCP-Bridge ein. Erkannt wird ein GX an einer
# Modbus-FC03-Probe auf die Seriennummer (Register 800, 6 Register ASCII,
# Unit-ID 100).
#
# Anders als bei Sigenergy ist die Seriennummer per Netz lesbar: beim ersten
# erfolgreichen Kontakt wird sie in STATE_DIR gemerkt, danach wird eine neue
# Adresse NUR uebernommen, wenn dort dieselbe Seriennummer antwortet. Ohne
# gemerkte Seriennummer wird eine neue Adresse nur bei GENAU EINEM Kandidaten
# im Netz uebernommen.
#
# Vorlage im Repository: inverters/victron/rediscover.sh - die Platzhalter
# @IBM_...@ ersetzt 04-install-rules.sh bei der Installation. Aufgerufen wird
# das installierte Skript von der Regel ibm_watchdog.js; manueller Testlauf:
#   sudo -u openhab /etc/openhab/scripts/ibm_rediscover.sh --force
#
# Laeuft die Anlage normal (Thing ONLINE), tut das Skript nichts und gibt
# nichts aus - es darf beliebig oft aufgerufen werden.
# ============================================================================
set -u

THING_UID="@IBM_HOST_THING_UID@"        # traegt die Adresse (die Modbus-tcp-Bridge)
WATCH_THING_UID="@IBM_WATCH_THING_UID@" # zeigt die Verbindung an (ein Daten-Thing)
HOST_PARAM="@IBM_HOST_PARAM@"
TOKEN_FILE="@IBM_TOKEN_FILE@"
STATE_DIR="@IBM_STATE_DIR@"
COOLDOWN_MIN="@IBM_COOLDOWN_MIN@"
REST="http://127.0.0.1:8080/rest"

# Systemebene der Victron-Registerkarte - fest 100
MODBUS_UNIT_ID=100

log() { echo "[IBM][Watchdog] $*"; }

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

# Die Modbus-tcp-Bridge meldet ONLINE, sobald sie konfiguriert ist - auch wenn
# niemand auf der Adresse antwortet (pi-020 2026-09-11, pi-223 2026-10-03:
# IP-Wechsel .107 -> .101, Poller und Daten-Things 3,5 h OFFLINE, Bridge
# ONLINE, Suche lief nie an). OFFLINE gehen nur Poller und Daten-Things.
# Deshalb den Status am Wechselrichter-Thing ablesen und nur die Adresse aus
# dem Bridge-Thing nehmen. Aeltere Installationen ohne den Platzhalter
# fallen auf das Bridge-Thing zurueck.
case "$WATCH_THING_UID" in ""|@*) WATCH_THING_UID="$THING_UID" ;; esac

mkdir -p "$STATE_DIR" 2>/dev/null || true

# Nur ein Lauf gleichzeitig (die Regel kann bei OFFLINE-Flattern oft feuern).
exec 9>"$STATE_DIR/rediscover.lock" 2>/dev/null \
  || { log "FEHLER: Kein Schreibzugriff auf $STATE_DIR"; exit 1; }
flock -n 9 || { log "Netzwerksuche laeuft bereits - Abbruch."; exit 0; }

[ -r "$TOKEN_FILE" ] || { log "FEHLER: API-Token nicht lesbar: $TOKEN_FILE"; exit 1; }
TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
[ -n "$TOKEN" ] || { log "FEHLER: API-Token-Datei ist leer: $TOKEN_FILE"; exit 1; }

auth_curl() { curl -s -H "Authorization: Bearer $TOKEN" "$@"; }

# Ersten String-Wert eines Schluessels aus einer JSON-Antwort ziehen.
# Bewusst ohne jq, damit keine Zusatzpakete noetig sind.
json_str() {
  printf '%s' "$1" \
    | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -n1 \
    | sed -e 's/.*:[[:space:]]*"//' -e 's/"$//'
}

# Seriennummer des GX unter der IP lesen (Modbus-FC03 auf 800, Unit 100).
# Ausgabe: die Seriennummer; leer, wenn kein GX antwortet.
probe_serial() {
  IBM_PROBE_IP="$1" IBM_PROBE_UNIT="$MODBUS_UNIT_ID" python3 - <<'PY'
import os, socket, struct, sys
ip = os.environ["IBM_PROBE_IP"]
unit = int(os.environ["IBM_PROBE_UNIT"])
try:
    s = socket.create_connection((ip, 502), timeout=1)
    s.settimeout(1.5)
    s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
              + struct.pack(">BHH", 3, 800, 6))
    resp = s.recv(256)
    s.close()
    if len(resp) >= 21 and resp[6] == unit and resp[7] == 3:
        serial = resp[9:21].decode("ascii", "ignore").strip("\x00 ")
        if serial:
            print(serial)
            sys.exit(0)
    sys.exit(1)
except OSError:
    sys.exit(1)
PY
}

remembered_serial="$(cat "$STATE_DIR/serial" 2>/dev/null || true)"

# --- Thing-Status und aktuelle Adresse abfragen -----------------------------
# Laedt das Thing $1 in THING_JSON; bei Fehlern endet das Skript mit Meldung.
# Bewusst keine Subshell (kein $(...)), damit exit und Meldung wirken.
fetch_thing() {
  local response http_code
  response="$(auth_curl -w '\n%{http_code}' -m 10 "$REST/things/$1")"
  http_code="${response##*$'\n'}"
  case "$http_code" in
    200) THING_JSON="${response%$'\n'*}" ;;
    401|403) log "FEHLER: API-Token wird abgelehnt (HTTP $http_code) - neues Token eintragen."; exit 1 ;;
    404) log "FEHLER: Thing nicht gefunden: $1"; exit 1 ;;
    *)   log "FEHLER: openHAB REST API nicht erreichbar (HTTP $http_code)."; exit 1 ;;
  esac
}

fetch_thing "$THING_UID"; host_json="$THING_JSON"
if [ "$WATCH_THING_UID" = "$THING_UID" ]; then
  watch_json="$host_json"
else
  fetch_thing "$WATCH_THING_UID"; watch_json="$THING_JSON"
fi

status="$(json_str "$watch_json" status)"
detail="$(json_str "$watch_json" statusDetail)"
current_host="$(json_str "$host_json" "$HOST_PARAM")"

# --- Normalbetrieb: nichts tun (nebenbei die Seriennummer merken) -----------
if [ "$status" = "ONLINE" ] && [ "$FORCE" -ne 1 ]; then
  if [ -z "$remembered_serial" ] && [ -n "$current_host" ]; then
    serial="$(probe_serial "$current_host" || true)"
    [ -n "$serial" ] && { printf '%s' "$serial" > "$STATE_DIR/serial"; log "Seriennummer gemerkt: $serial"; }
  fi
  exit 0
fi

log "Thing $WATCH_THING_UID ist $status ($detail), konfigurierte Adresse in $THING_UID: ${current_host:-unbekannt}."

# Antwortet die konfigurierte Adresse noch, liegt es nicht an der IP -
# dann bringt eine Netzwerksuche nichts (z. B. Modbus TCP am GX deaktiviert).
if [ -n "$current_host" ]; then
  serial="$(probe_serial "$current_host" || true)"
  if [ -n "$serial" ]; then
    log "GX antwortet weiterhin unter $current_host (Seriennummer $serial) - keine Suche."
    log "Ursache liegt nicht an der Adresse (Modbus TCP am GX aktiv? openhab.log pruefen)."
    [ -z "$remembered_serial" ] && printf '%s' "$serial" > "$STATE_DIR/serial"
    exit 0
  fi
fi

# --- Abkuehlzeit: fruehestens alle COOLDOWN_MIN Minuten suchen --------------
now="$(date +%s)"
last="$(cat "$STATE_DIR/last_scan" 2>/dev/null || echo 0)"
case "$last" in ''|*[!0-9]*) last=0 ;; esac
if [ "$FORCE" -ne 1 ] && [ $((now - last)) -lt $((COOLDOWN_MIN * 60)) ]; then
  log "Letzte Suche vor $(( (now - last) / 60 )) min - Abkuehlzeit ${COOLDOWN_MIN} min, Abbruch."
  exit 0
fi
echo "$now" > "$STATE_DIR/last_scan"

# --- Netz absuchen ----------------------------------------------------------
own_cidr="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4; exit}')"
[ -n "$own_cidr" ] || { log "FEHLER: Keine eigene IPv4-Adresse gefunden."; exit 1; }
base="${own_cidr%/*}"; base="${base%.*}"
prefix="${own_cidr#*/}"
[ "$prefix" -lt 24 ] 2>/dev/null && log "Hinweis: Eigenes Netz ist /$prefix - durchsucht wird nur ${base}.0/24."

log "Suche GX-Geraete (Modbus, Unit $MODBUS_UNIT_ID) in ${base}.0/24 ..."
# Eine Zeile je Fund: "IP Seriennummer"
candidates="$(IBM_SCAN_BASE="$base" IBM_SCAN_UNIT="$MODBUS_UNIT_ID" python3 - <<'PY'
import concurrent.futures, os, socket, struct

base = os.environ["IBM_SCAN_BASE"]
unit = int(os.environ["IBM_SCAN_UNIT"])

def probe(ip):
    try:
        s = socket.create_connection((ip, 502), timeout=1)
        s.settimeout(1.5)
        s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
                  + struct.pack(">BHH", 3, 800, 6))
        resp = s.recv(256)
        s.close()
        if len(resp) >= 21 and resp[6] == unit and resp[7] == 3:
            serial = resp[9:21].decode("ascii", "ignore").strip("\x00 ")
            if serial:
                return ip + " " + serial
    except OSError:
        pass
    return None

ips = [base + "." + str(i) for i in range(1, 255)]
with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
    for hit in pool.map(probe, ips):
        if hit:
            print(hit)
PY
)"

if [ -z "$candidates" ]; then
  log "Kein GX-Geraet im Netz gefunden - Anlage aus oder Modbus TCP deaktiviert?"
  log "Naechster Versuch fruehestens in ${COOLDOWN_MIN} Minuten."
  exit 0
fi

found=""
if [ -n "$remembered_serial" ]; then
  # Nur das Geraet mit der gemerkten Seriennummer akzeptieren.
  found="$(printf '%s\n' "$candidates" | awk -v s="$remembered_serial" '$2 == s { print $1; exit }')"
  if [ -z "$found" ]; then
    log "FEHLER: Kein Kandidat traegt die gemerkte Seriennummer $remembered_serial."
    log "Gefunden: $(printf '%s' "$candidates" | tr '\n' ' ')"
    log "Wurde das GX-Geraet getauscht, $STATE_DIR/serial loeschen und erneut suchen."
    exit 1
  fi
else
  count="$(printf '%s\n' "$candidates" | grep -c .)"
  if [ "$count" -ne 1 ]; then
    log "FEHLER: $count Modbus-Kandidaten gefunden ($(printf '%s' "$candidates" | tr '\n' ' '))."
    log "Ohne gemerkte Seriennummer kann nicht entschieden werden - die richtige"
    log "IP von Hand im Bridge-Thing eintragen; die Seriennummer wird dann beim"
    log "naechsten ONLINE-Lauf gemerkt."
    exit 1
  fi
  found="$(printf '%s\n' "$candidates" | awk '{ print $1; exit }')"
  remembered_serial="$(printf '%s\n' "$candidates" | awk '{ print $2; exit }')"
  printf '%s' "$remembered_serial" > "$STATE_DIR/serial"
  log "Seriennummer gemerkt: $remembered_serial"
fi

if [ "$found" = "$current_host" ]; then
  log "Gefundene Adresse entspricht der konfigurierten ($found) - das Binding verbindet sich von selbst neu."
  exit 0
fi

# --- Neue Adresse in das Thing eintragen ------------------------------------
log "Neue Adresse gefunden: ${current_host:-unbekannt} -> $found - aktualisiere Thing-Konfiguration."
code="$(auth_curl -o /dev/null -w '%{http_code}' -X PUT \
  -H 'Content-Type: application/json' \
  -d "{\"$HOST_PARAM\": \"$found\"}" \
  "$REST/things/$THING_UID/config")"

if [ "$code" != "200" ]; then
  log "FEHLER: Thing-Konfiguration konnte nicht aktualisiert werden (HTTP $code)."
  exit 1
fi

log "Thing-Konfiguration aktualisiert - das Binding initialisiert sich neu."

# Der Poller braucht nach dem Neustart der Bridge einen erfolgreichen Zyklus,
# bis das Daten-Thing wieder ONLINE meldet.
sleep 20
verify="$(auth_curl -m 10 "$REST/things/$WATCH_THING_UID/status" || true)"
log "Status von $WATCH_THING_UID nach dem Update: $(json_str "$verify" status || echo unbekannt)"
