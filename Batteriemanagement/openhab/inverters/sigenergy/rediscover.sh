#!/usr/bin/env bash
# ============================================================================
# IBM - Netzwerksuche Sigenergy SigenStor
#
# Findet die Anlage im lokalen Netz wieder, wenn der Router ihr per DHCP eine
# neue IP zugeteilt hat, und traegt die neue Adresse ueber die openHAB REST
# API in die Modbus-TCP-Bridge ein. Erkannt wird eine SigenStor an einer
# Modbus-FC04-Probe auf das EMS-Modus-Register (30003) an Slave 247.
#
# Anders als bei Fronius gibt es auf Anlagenebene keine per Netz lesbare
# Seriennummer - eine neue Adresse wird deshalb nur uebernommen, wenn GENAU
# EINE SigenStor im Netz antwortet. Stehen mehrere Anlagen im selben Netz,
# muss die IP von Hand im Bridge-Thing gepflegt werden (das Skript bricht
# dann mit einem Hinweis ab).
#
# Vorlage im Repository: inverters/sigenergy/rediscover.sh - die Platzhalter
# @IBM_...@ ersetzt 04-install-rules.sh bei der Installation. Aufgerufen wird
# das installierte Skript von der Regel ibm_watchdog.js; manueller Testlauf:
#   sudo -u openhab /etc/openhab/scripts/ibm_rediscover.sh --force
#
# Laeuft die Anlage normal (Thing ONLINE), tut das Skript nichts und gibt
# nichts aus - es darf beliebig oft aufgerufen werden.
# ============================================================================
set -u

THING_UID="@IBM_HOST_THING_UID@"
HOST_PARAM="@IBM_HOST_PARAM@"
TOKEN_FILE="@IBM_TOKEN_FILE@"
STATE_DIR="@IBM_STATE_DIR@"
COOLDOWN_MIN="@IBM_COOLDOWN_MIN@"
REST="http://127.0.0.1:8080/rest"

# Anlagenebene des Sigenergy-Modbus-Protokolls - fest 247
MODBUS_UNIT_ID=247

log() { echo "[IBM][Watchdog] $*"; }

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

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

# Antwortet unter der IP eine SigenStor (Modbus-FC04 auf 30003, Slave 247)?
probe() {
  IBM_PROBE_IP="$1" IBM_PROBE_UNIT="$MODBUS_UNIT_ID" python3 - <<'PY'
import os, socket, struct, sys
ip = os.environ["IBM_PROBE_IP"]
unit = int(os.environ["IBM_PROBE_UNIT"])
try:
    s = socket.create_connection((ip, 502), timeout=1)
    s.settimeout(1.5)
    s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
              + struct.pack(">BHH", 4, 30003, 1))
    resp = s.recv(256)
    s.close()
    sys.exit(0 if len(resp) >= 9 and resp[6] == unit and resp[7] == 4 else 1)
except OSError:
    sys.exit(1)
PY
}

# --- Thing-Status und aktuelle Adresse abfragen -----------------------------
response="$(auth_curl -w '\n%{http_code}' "$REST/things/$THING_UID")"
http_code="${response##*$'\n'}"
thing_json="${response%$'\n'*}"
case "$http_code" in
  200) ;;
  401|403) log "FEHLER: API-Token wird abgelehnt (HTTP $http_code) - neues Token eintragen."; exit 1 ;;
  404) log "FEHLER: Thing nicht gefunden: $THING_UID"; exit 1 ;;
  *)   log "FEHLER: openHAB REST API nicht erreichbar (HTTP $http_code)."; exit 1 ;;
esac

status="$(json_str "$thing_json" status)"
detail="$(json_str "$thing_json" statusDetail)"
current_host="$(json_str "$thing_json" "$HOST_PARAM")"

# --- Normalbetrieb: nichts tun ----------------------------------------------
if [ "$status" = "ONLINE" ] && [ "$FORCE" -ne 1 ]; then
  exit 0
fi

log "Thing $THING_UID ist $status ($detail), konfigurierte Adresse: ${current_host:-unbekannt}."

# Antwortet die konfigurierte Adresse noch, liegt es nicht an der IP -
# dann bringt eine Netzwerksuche nichts (z. B. Modbus in der App deaktiviert).
if [ -n "$current_host" ] && probe "$current_host"; then
  log "Anlage antwortet weiterhin unter $current_host - keine Suche."
  log "Ursache liegt nicht an der Adresse (Modbus in der mySigen-App aktiv? openhab.log pruefen)."
  exit 0
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

log "Suche SigenStor (Modbus, Slave $MODBUS_UNIT_ID) in ${base}.0/24 ..."
candidates="$(IBM_SCAN_BASE="$base" IBM_SCAN_UNIT="$MODBUS_UNIT_ID" python3 - <<'PY'
import concurrent.futures, os, socket, struct

base = os.environ["IBM_SCAN_BASE"]
unit = int(os.environ["IBM_SCAN_UNIT"])

def probe(ip):
    try:
        s = socket.create_connection((ip, 502), timeout=1)
        s.settimeout(1.5)
        s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
                  + struct.pack(">BHH", 4, 30003, 1))
        resp = s.recv(256)
        s.close()
        if len(resp) >= 9 and resp[6] == unit and resp[7] == 4:
            return ip
    except OSError:
        pass
    return None

ips = [base + "." + str(i) for i in range(1, 255)]
with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
    for ip in pool.map(probe, ips):
        if ip:
            print(ip)
PY
)"

if [ -z "$candidates" ]; then
  log "Keine SigenStor im Netz gefunden - Anlage aus oder Modbus deaktiviert?"
  log "Naechster Versuch fruehestens in ${COOLDOWN_MIN} Minuten."
  exit 0
fi

count="$(printf '%s\n' "$candidates" | grep -c .)"
if [ "$count" -ne 1 ]; then
  log "FEHLER: $count Modbus-Kandidaten gefunden ($(printf '%s' "$candidates" | tr '\n' ' '))."
  log "Ohne lesbare Seriennummer kann nicht entschieden werden - die richtige"
  log "IP von Hand im Bridge-Thing eintragen."
  exit 1
fi
found="$(printf '%s\n' "$candidates" | head -n1)"

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

sleep 15
verify="$(auth_curl "$REST/things/$THING_UID/status" || true)"
log "Thing-Status nach dem Update: $(json_str "$verify" status || echo unbekannt)"
