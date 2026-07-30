#!/usr/bin/env bash
# ============================================================================
# IBM - Netzwerksuche Fronius
#
# Findet den Wechselrichter im lokalen Netz wieder, wenn der Router ihm per
# DHCP eine neue IP zugeteilt hat, und traegt die neue Adresse ueber die
# openHAB REST API in das Bridge-Thing ein. Erkannt wird ein Fronius am
# Solar-API-Endpunkt /solar_api/GetAPIVersion.cgi; die Identitaet wird ueber
# die Seriennummern (UniqueID aus GetInverterInfo.cgi) abgeglichen, damit
# nicht versehentlich ein fremdes Geraet uebernommen wird. Die Seriennummern
# merkt sich das Skript selbst, solange die Anlage ONLINE ist.
#
# Vorlage im Repository: inverters/fronius/rediscover.sh - die Platzhalter
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

log() { echo "[IBM][Watchdog] $*"; }

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

serial_file="$STATE_DIR/inverter_serial"

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

# Antwortet unter der IP eine Fronius Solar API?
probe() {
  curl -sf -m 2 --connect-timeout 1 "http://$1/solar_api/GetAPIVersion.cgi" 2>/dev/null \
    | grep -q '"APIVersion"'
}

# Seriennummern (UniqueID) aller Geraete hinter einer IP, eine pro Zeile.
serials_of() {
  curl -sf -m 4 "http://$1/solar_api/v1/GetInverterInfo.cgi" 2>/dev/null \
    | grep -o '"UniqueID"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | sed -e 's/.*:[[:space:]]*"//' -e 's/"$//' \
    | sort -u
}

remember_serials() {
  [ -n "$1" ] || return 0
  if ! printf '%s\n' "$1" | cmp -s - "$serial_file" 2>/dev/null; then
    printf '%s\n' "$1" > "$serial_file"
    log "Seriennummer(n) gemerkt: $(printf '%s' "$1" | tr '\n' ' ')"
  fi
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

# --- Normalbetrieb: nichts tun, nebenbei die Seriennummern aktuell halten ---
if [ "$status" = "ONLINE" ] && [ "$FORCE" -ne 1 ]; then
  [ -n "$current_host" ] && remember_serials "$(serials_of "$current_host" || true)"
  exit 0
fi

log "Thing $THING_UID ist $status ($detail), konfigurierte Adresse: ${current_host:-unbekannt}."

# Antwortet die konfigurierte Adresse noch, liegt es nicht an der IP -
# dann bringt eine Netzwerksuche nichts (z. B. Credentials, Nachtmodus).
if [ -n "$current_host" ] && probe "$current_host"; then
  log "Wechselrichter antwortet weiterhin unter $current_host - keine Suche."
  log "Ursache liegt nicht an der Adresse (Credentials? Binding? openhab.log pruefen)."
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

log "Suche Fronius Solar API in ${base}.0/24 ..."
candidates="$(seq 1 254 | xargs -P 32 -I'{}' sh -c '
  if curl -sf -m 2 --connect-timeout 1 "http://$1/solar_api/GetAPIVersion.cgi" 2>/dev/null | grep -q "\"APIVersion\""; then
    echo "$1"
  fi' _ "${base}.{}")"

if [ -z "$candidates" ]; then
  log "Kein Fronius im Netz gefunden - Wechselrichter aus oder Datamanager im Nachtmodus?"
  log "Naechster Versuch fruehestens in ${COOLDOWN_MIN} Minuten."
  exit 0
fi

# --- Identitaet pruefen und Kandidaten auswaehlen ---------------------------
expected="$(cat "$serial_file" 2>/dev/null || true)"

found=""
found_serials=""
count=0
first_ip=""
first_serials=""
for ip in $candidates; do
  count=$((count + 1))
  s="$(serials_of "$ip" || true)"
  [ "$count" -eq 1 ] && { first_ip="$ip"; first_serials="$s"; }
  log "Kandidat: $ip (UniqueID: $(printf '%s' "$s" | tr '\n' ' '))"
  if [ -n "$expected" ] && [ -z "$found" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      if printf '%s\n' "$expected" | grep -qFx "$line"; then
        found="$ip"
        found_serials="$s"
        break
      fi
    done <<< "$s"
  fi
done

if [ -z "$expected" ]; then
  if [ "$count" -eq 1 ]; then
    found="$first_ip"
    found_serials="$first_serials"
  else
    log "FEHLER: $count Fronius-Geraete gefunden, aber keine bekannte Seriennummer in $serial_file."
    log "Die richtige IP einmal von Hand im Thing eintragen - die Seriennummer wird dann automatisch gemerkt."
    exit 1
  fi
elif [ -z "$found" ]; then
  log "Keiner der Kandidaten traegt die bekannte Seriennummer ($(printf '%s' "$expected" | tr '\n' ' ')) - keine Aenderung."
  exit 1
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

remember_serials "$found_serials"
log "Thing-Konfiguration aktualisiert - das Binding initialisiert sich neu."

sleep 15
verify="$(auth_curl "$REST/things/$THING_UID/status" || true)"
log "Thing-Status nach dem Update: $(json_str "$verify" status || echo unbekannt)"
