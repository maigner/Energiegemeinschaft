#!/usr/bin/env bash
# ============================================================================
# Gemeinsame Helfer fuer die IBM-Setup-Skripte.
# Wird von den nummerierten Skripten per `. lib/common.sh` eingebunden.
# ============================================================================

# openHAB-Pfade einer paketbasierten Installation (openHABian).
# Ueber Umgebungsvariablen ueberschreibbar.
OPENHAB_CONF="${OPENHAB_CONF:-/etc/openhab}"
OPENHAB_USERDATA="${OPENHAB_USERDATA:-/var/lib/openhab}"
OPENHAB_LOGDIR="${OPENHAB_LOGDIR:-/var/log/openhab}"
OPENHAB_USER="${OPENHAB_USER:-openhab}"
OPENHAB_GROUP="${OPENHAB_GROUP:-openhab}"

# Verzeichnis, in dem die Setup-Skripte liegen
IBM_SETUP_DIR="${IBM_SETUP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Verzeichnis mit den openHAB-Skripten (eine Ebene ueber setup/)
IBM_SCRIPT_DIR="${IBM_SCRIPT_DIR:-$(cd "$IBM_SETUP_DIR/.." && pwd)}"

# Verzeichnis mit den Wechselrichter-Profilen
IBM_INVERTER_DIR="${IBM_INVERTER_DIR:-$IBM_SCRIPT_DIR/inverters}"

IBM_CONF="${IBM_CONF:-$IBM_SETUP_DIR/ibm.conf}"

log()  { echo "[IBM] $*"; }
warn() { echo "[IBM] WARNUNG: $*" >&2; }
die()  { echo "[IBM] FEHLER: $*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Bitte mit sudo ausfuehren: sudo $0"
}

require_openhab() {
  [ -d "$OPENHAB_CONF" ] || die "$OPENHAB_CONF nicht gefunden - ist openHAB installiert?"
}

# ---------------------------------------------------------------------------
# Eingaben
#
# Liest bevorzugt von /dev/tty, damit die Abfragen auch dann funktionieren,
# wenn das Skript ueber eine Pipe gestartet wurde (curl ... | sudo bash).
# ---------------------------------------------------------------------------
has_tty() { [ -r /dev/tty ]; }

# ask VARNAME "Frage" ["Vorgabe"]
ask() {
  local __var="$1" __question="$2" __default="${3:-}" __input="" __prompt

  if [ -n "$__default" ]; then
    __prompt="[IBM] ${__question} [${__default}]: "
  else
    __prompt="[IBM] ${__question}: "
  fi

  if [ "${IBM_ASSUME_YES:-0}" = "1" ]; then
    printf -v "$__var" '%s' "$__default"
    log "${__question} -> ${__default} (IBM_ASSUME_YES=1)"
    return 0
  fi

  if has_tty; then
    read -r -p "$__prompt" __input < /dev/tty || true
  else
    read -r -p "$__prompt" __input || true
  fi

  [ -z "$__input" ] && __input="$__default"
  printf -v "$__var" '%s' "$__input"
}

# ask_secret VARNAME "Frage" - verdeckte Eingabe mit Wiederholung.
# Laesst leere Eingabe zu (Aufrufer entscheidet, was dann passiert).
# Ohne Terminal oder mit IBM_ASSUME_YES=1 bleibt die Variable leer.
ask_secret() {
  local __var="$1" __question="$2" __p1="" __p2="" __tries=0
  printf -v "$__var" '%s' ""
  if [ "${IBM_ASSUME_YES:-0}" = "1" ] || ! has_tty; then
    return 0
  fi
  while [ "$__tries" -lt 3 ]; do
    read -rs -p "[IBM] ${__question}: " __p1 < /dev/tty || true
    echo
    [ -z "$__p1" ] && return 0
    read -rs -p "[IBM] Wiederholung: " __p2 < /dev/tty || true
    echo
    if [ "$__p1" = "$__p2" ]; then
      printf -v "$__var" '%s' "$__p1"
      return 0
    fi
    warn "Die Eingaben stimmen nicht ueberein."
    __tries=$((__tries + 1))
  done
  return 0
}

# Rueckfrage vor heiklen Schritten. Mit IBM_ASSUME_YES=1 uebersprungen.
confirm() {
  local prompt="$1" answer=""
  if [ "${IBM_ASSUME_YES:-0}" = "1" ]; then
    log "$prompt -> automatisch bestaetigt (IBM_ASSUME_YES=1)"
    return 0
  fi
  if has_tty; then
    read -r -p "[IBM] $prompt [j/N] " answer < /dev/tty || true
  else
    read -r -p "[IBM] $prompt [j/N] " answer || true
  fi
  case "$answer" in
    [jJ]|[jJ][aA]|[yY]|[yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Konfiguration und Wechselrichter-Profil
# ---------------------------------------------------------------------------

# Liste der verfuegbaren Wechselrichter-Profile (Verzeichnisnamen).
list_inverters() {
  local d
  for d in "$IBM_INVERTER_DIR"/*/; do
    [ -f "${d}profile.sh" ] || continue
    basename "$d"
  done
}

# Laedt inverters/<typ>/profile.sh und prueft die Pflichtfelder.
load_profile() {
  local type="${1:-${INVERTER_TYPE:-fronius}}"
  local profile="$IBM_INVERTER_DIR/$type/profile.sh"

  [ -f "$profile" ] || die "Unbekannter Wechselrichter-Typ '$type'. Verfuegbar: $(list_inverters | tr '\n' ' ')"

  # shellcheck disable=SC1090
  . "$profile"
  INVERTER_TYPE="$type"

  : "${INVERTER_BINDING:?INVERTER_BINDING fehlt in $profile}"
  : "${INVERTER_THING_PREFIX:?INVERTER_THING_PREFIX fehlt in $profile}"
  : "${INVERTER_CONTROL_SCRIPT:?INVERTER_CONTROL_SCRIPT fehlt in $profile}"
  : "${INVERTER_SOC_PLACEHOLDER:?INVERTER_SOC_PLACEHOLDER fehlt in $profile}"
  INVERTER_LABEL="${INVERTER_LABEL:-$type}"
  INVERTER_SOC_CHANNEL="${INVERTER_SOC_CHANNEL:-soc}"
  INVERTER_NOTES="${INVERTER_NOTES:-}"

  # Optional: Batterieleistung fuer die Overview-Seite (nur wenn das Profil
  # Channel und Platzhalter kennt)
  INVERTER_BATTERY_POWER_CHANNEL="${INVERTER_BATTERY_POWER_CHANNEL:-}"
  INVERTER_BATTERY_POWER_PLACEHOLDER="${INVERTER_BATTERY_POWER_PLACEHOLDER:-}"

  # Optional: Netzwerk-Watchdog (nur wenn das Profil eine Netzwerksuche hat)
  INVERTER_HOST_THING_PREFIX="${INVERTER_HOST_THING_PREFIX:-}"
  INVERTER_HOST_PARAM="${INVERTER_HOST_PARAM:-hostname}"
  INVERTER_REDISCOVER_SCRIPT="${INVERTER_REDISCOVER_SCRIPT:-}"

  # Optional: automatisches Anlegen der Things (02b-install-things.sh);
  # braucht INVERTER_HOST_THING_PREFIX als Bridge-Thing-Typ
  INVERTER_DEFAULT_USERNAME="${INVERTER_DEFAULT_USERNAME:-}"
  INVERTER_USER_PARAM="${INVERTER_USER_PARAM:-}"
  INVERTER_PASSWORD_PARAM="${INVERTER_PASSWORD_PARAM:-}"
  INVERTER_THING_EXTRA_CONFIG="${INVERTER_THING_EXTRA_CONFIG:-}"

  log "Wechselrichter-Profil geladen: $INVERTER_LABEL ($type)"
}

# Konfiguration laden, Pflichtfelder pruefen, Profil einbinden.
load_config() {
  [ -f "$IBM_CONF" ] || die "ibm.conf fehlt. Assistent starten mit: sudo $IBM_SETUP_DIR/00-wizard.sh"
  # shellcheck disable=SC1090
  . "$IBM_CONF"
  log "Konfiguration geladen: $IBM_CONF"

  : "${INVERTER_THING_UID:?INVERTER_THING_UID fehlt in ibm.conf}"
  : "${SOC_ITEM:?SOC_ITEM fehlt in ibm.conf}"
  : "${IBM_API_BASE:?IBM_API_BASE fehlt in ibm.conf}"

  # Defaults, falls eine aeltere ibm.conf noch nicht alles kennt
  INVERTER_TYPE="${INVERTER_TYPE:-fronius}"
  BATTERY_POWER_ITEM="${BATTERY_POWER_ITEM:-}"
  CRON_BATTERY="${CRON_BATTERY:-0 */5 * * * ?}"
  CRON_CLOUD="${CRON_CLOUD:-0 40 * * * ?}"
  CRON_CROSSOVER="${CRON_CROSSOVER:-0 5 4 * * ?}"
  CRON_LADESPERRE="${CRON_LADESPERRE:-0 50 * * * ?}"
  CRON_INIT="${CRON_INIT:-0 */10 * * * ?}"
  CRON_PAUSE="${CRON_PAUSE:-0 30 0 * * ?}"
  DEFAULT_MIN_BATTERY_CHARGE="${DEFAULT_MIN_BATTERY_CHARGE:-20}"
  DEFAULT_MIN_DISCHARGE_W="${DEFAULT_MIN_DISCHARGE_W:-1000}"
  DEFAULT_MAX_DISCHARGE_W="${DEFAULT_MAX_DISCHARGE_W:-3000}"
  DEFAULT_LADESPERRE_AKTIV="${DEFAULT_LADESPERRE_AKTIV:-ON}"
  DEFAULT_WOLKEN_SCHWELLE="${DEFAULT_WOLKEN_SCHWELLE:-75}"
  DEFAULT_ENTLADUNG_AKTIV="${DEFAULT_ENTLADUNG_AKTIV:-ON}"
  DEFAULT_DYNAMISCHE_LEISTUNG="${DEFAULT_DYNAMISCHE_LEISTUNG:-ON}"
  INSTALL_ADDONS="${INSTALL_ADDONS:-1}"
  INSTALL_PERSISTENCE="${INSTALL_PERSISTENCE:-1}"
  # Aeltere ibm.conf kennt die Optionen noch nicht - dann nichts aendern.
  INSTALL_CLOUD="${INSTALL_CLOUD:-0}"
  INSTALL_OVERVIEW="${INSTALL_OVERVIEW:-0}"

  # Netzwerk-Watchdog (aeltere ibm.conf kennt die Optionen noch nicht)
  INSTALL_WATCHDOG="${INSTALL_WATCHDOG:-0}"
  INVERTER_HOST_THING_UID="${INVERTER_HOST_THING_UID:-}"
  OH_API_TOKEN="${OH_API_TOKEN:-}"
  CRON_WATCHDOG="${CRON_WATCHDOG:-0 7/15 * * * ?}"
  WATCHDOG_COOLDOWN_MIN="${WATCHDOG_COOLDOWN_MIN:-10}"

  # WireGuard-Fernwartung (aeltere ibm.conf kennt die Optionen noch nicht)
  INSTALL_WIREGUARD="${INSTALL_WIREGUARD:-0}"
  WG_ADDRESS="${WG_ADDRESS:-}"
  WG_SERVER_ENDPOINT="${WG_SERVER_ENDPOINT:-s1.ischlstrom.org:51820}"
  WG_SERVER_PUBLIC_KEY="${WG_SERVER_PUBLIC_KEY:-}"
  WG_SSH_USER="${WG_SSH_USER:-openhabian}"

  # Standardpasswoerter (aeltere ibm.conf kennt die Option noch nicht)
  INSTALL_PASSWORD_CHANGE="${INSTALL_PASSWORD_CHANGE:-0}"

  # Automatisches Anlegen des Wechselrichter-Things (02b-install-things.sh)
  AUTO_CREATE_THING="${AUTO_CREATE_THING:-0}"
  INVERTER_HOST="${INVERTER_HOST:-}"
  INVERTER_USERNAME="${INVERTER_USERNAME:-}"
  INVERTER_PASSWORD="${INVERTER_PASSWORD:-}"

  load_profile "$INVERTER_TYPE"
}

# Setzt einen Schluessel in der bestehenden ibm.conf (Wert in Anfuehrungs-
# zeichen). Nur fuer Werte ohne '|', '&' und '"' verwenden (Tokens, Flags).
conf_set() {
  local key="$1" value="$2"
  [ -f "$IBM_CONF" ] || die "conf_set: $IBM_CONF fehlt."
  if grep -qE "^${key}=" "$IBM_CONF"; then
    sed -i -E "s|^${key}=.*|${key}=\"${value}\"|" "$IBM_CONF"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$IBM_CONF"
  fi
}

# ---------------------------------------------------------------------------
# Erkennung in der openHAB-JSONDB (Best effort - der Assistent laesst die
# Werte immer bestaetigen oder ueberschreiben)
# ---------------------------------------------------------------------------

# Kandidaten fuer die Thing-UID des Wechselrichters.
# Optionales Argument: abweichendes UID-Praefix (z. B. die Bridge).
detect_thing_uids() {
  local prefix="${1:-$INVERTER_THING_PREFIX}"
  local db="$OPENHAB_USERDATA/jsondb/org.openhab.core.thing.Thing.json"
  [ -f "$db" ] || return 0
  # Thing-UIDs haben 3 oder 4 Segmente; alles Laengere ist eine Channel-UID.
  # "|| true": ohne Treffer beendet grep sich mit 1, und unter dem
  # "set -euo pipefail" der Aufrufer wuerde das die Funktion abbrechen.
  grep -o "\"${prefix}:[^\"]*\"" "$db" 2>/dev/null \
    | tr -d '"' \
    | awk -F: 'NF>=3 && NF<=4' \
    | sort -u || true
}

# Kandidaten fuer das SoC-Item. Zuerst ueber die Channel-Verknuepfung,
# ersatzweise ueber Itemnamen, die nach Ladestand aussehen.
detect_soc_items() {
  local thing_uid="${1:-}"
  local linkdb="$OPENHAB_USERDATA/jsondb/org.openhab.core.thing.link.ItemChannelLink.json"
  local itemdb="$OPENHAB_USERDATA/jsondb/org.openhab.core.items.Item.json"
  local found=""

  # In der JSONDB heissen die Link-Schluessel "<Item> -> <channelUID>".
  # "|| true" jeweils: ohne Treffer beendet grep sich mit 1, und unter dem
  # "set -euo pipefail" der Aufrufer wuerde das die Funktion abbrechen,
  # bevor die Ersatzsuchen laufen.
  if [ -n "$thing_uid" ] && [ -f "$linkdb" ]; then
    found="$(grep -o "\"[^\"]* -> ${thing_uid}:${INVERTER_SOC_CHANNEL}\"" "$linkdb" 2>/dev/null \
             | sed -e 's/^"//' -e 's/ ->.*//' | sort -u || true)"
  fi

  # Ersatzweise andere Channels desselben Things, die nach Ladestand
  # aussehen - die Channel-ID variiert je nach Binding-Version.
  if [ -z "$found" ] && [ -n "$thing_uid" ] && [ -f "$linkdb" ]; then
    found="$(grep -ioE "\"[^\"]+ -> ${thing_uid}:[^\"]*(soc|charge|ladestand|akku)[^\"]*\"" "$linkdb" 2>/dev/null \
             | sed -e 's/^"//' -e 's/ ->.*//' | sort -u || true)"
  fi

  # Datei-Items: bei der automatischen Einrichtung schreibt
  # 03-install-items.sh das SoC-Item mit Channel-Verknuepfung in ibm.items.
  if [ -z "$found" ] && [ -f "$OPENHAB_CONF/items/ibm.items" ]; then
    found="$(grep -E "channel=\"[^\"]*:${INVERTER_SOC_CHANNEL}\"" "$OPENHAB_CONF/items/ibm.items" 2>/dev/null \
             | awk '{print $2}' | sort -u || true)"
  fi

  if [ -z "$found" ] && [ -f "$itemdb" ]; then
    found="$(grep -o '"[A-Za-z0-9_]*"' "$itemdb" 2>/dev/null \
             | tr -d '"' \
             | grep -Ei 'soc|state_?of_?charge|ladestand' \
             | sort -u || true)"
  fi

  printf '%s' "$found"
}

# Kandidaten fuer das Batterieleistungs-Item (Overview-Seite). Zuerst ueber
# die Channel-Verknuepfung, ersatzweise ueber Itemnamen.
detect_battery_power_items() {
  local thing_uid="${1:-}"
  local linkdb="$OPENHAB_USERDATA/jsondb/org.openhab.core.thing.link.ItemChannelLink.json"
  local itemdb="$OPENHAB_USERDATA/jsondb/org.openhab.core.items.Item.json"
  local found=""

  # "|| true" jeweils: siehe detect_soc_items.
  if [ -n "$thing_uid" ] && [ -n "$INVERTER_BATTERY_POWER_CHANNEL" ] && [ -f "$linkdb" ]; then
    found="$(grep -o "\"[^\"]* -> ${thing_uid}:${INVERTER_BATTERY_POWER_CHANNEL}\"" "$linkdb" 2>/dev/null \
             | sed -e 's/^"//' -e 's/ ->.*//' | sort -u || true)"
  fi

  if [ -z "$found" ] && [ -n "$INVERTER_BATTERY_POWER_CHANNEL" ] && [ -f "$OPENHAB_CONF/items/ibm.items" ]; then
    found="$(grep -E "channel=\"[^\"]*:${INVERTER_BATTERY_POWER_CHANNEL}\"" "$OPENHAB_CONF/items/ibm.items" 2>/dev/null \
             | awk '{print $2}' | sort -u || true)"
  fi

  if [ -z "$found" ] && [ -f "$itemdb" ]; then
    found="$(grep -o '"[A-Za-z0-9_]*"' "$itemdb" 2>/dev/null \
             | tr -d '"' \
             | grep -Ei 'battery_?power|batterieleistung|pakku' \
             | sort -u || true)"
  fi

  printf '%s' "$found"
}

# ---------------------------------------------------------------------------
# Addons (addons.cfg)
#
# ACHTUNG: Sobald in addons.cfg eine Kategorie gesetzt ist, ist die Datei
# fuer diese Kategorie massgeblich - siehe Warnung in README.md.
# ---------------------------------------------------------------------------
ADDONS_CFG="${ADDONS_CFG:-$OPENHAB_CONF/services/addons.cfg}"

# Legt addons.cfg an bzw. sichert die bestehende Datei.
addons_cfg_prepare() {
  mkdir -p "$(dirname "$ADDONS_CFG")"
  if [ ! -f "$ADDONS_CFG" ]; then
    log "addons.cfg existiert nicht und wird angelegt: $ADDONS_CFG"
    : > "$ADDONS_CFG"
    chown "$OPENHAB_USER:$OPENHAB_GROUP" "$ADDONS_CFG" 2>/dev/null || true
  else
    cp -a "$ADDONS_CFG" "$ADDONS_CFG.bak-$(date +%Y%m%d%H%M%S)"
    log "Backup angelegt: $ADDONS_CFG.bak-*"
  fi
}

# Steht der Wert bereits in der kommaseparierten Liste der Kategorie?
addons_cfg_has() {
  local key="$1" value="$2" current
  [ -f "$ADDONS_CFG" ] || return 1
  current="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$ADDONS_CFG" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
  case ",${current}," in
    *",${value},"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Haengt einen Wert an die kommaseparierte Liste einer Kategorie an, ohne
# Duplikate und ohne bestehende Werte zu ueberschreiben.
addons_cfg_add() {
  local key="$1" value="$2" current merged
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$ADDONS_CFG"; then
    if addons_cfg_has "$key" "$value"; then
      log "${key}: '${value}' bereits eingetragen."
      return 0
    fi
    current="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$ADDONS_CFG" | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
    merged="${current:+${current},}${value}"
    sed -i -E "s|^[[:space:]]*${key}[[:space:]]*=.*|${key} = ${merged}|" "$ADDONS_CFG"
    log "${key}: '${value}' ergaenzt -> ${merged}"
  else
    printf '%s = %s\n' "$key" "$value" >> "$ADDONS_CFG"
    log "${key}: '${value}' neu eingetragen."
  fi
}

# Wartet, bis openHAB das Karaf-Feature installiert hat (Meldung des
# FeatureInstallers in openhab.log), z. B. openhab-binding-fronius.
wait_for_addon() {
  local feature="$1" timeout="${2:-300}" waited=0
  local logfile="$OPENHAB_LOGDIR/openhab.log"
  log "Warte auf die Installation von '${feature}' (max. $((timeout / 60)) Minuten) ..."
  while [ "$waited" -lt "$timeout" ]; do
    if grep -q "Installed '${feature}'" "$logfile" 2>/dev/null; then
      log "'${feature}' ist installiert."
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  warn "Keine Installationsbestaetigung fuer '${feature}' im Log gefunden -"
  warn "Status in der Main UI pruefen: Settings -> Add-ons."
  return 1
}

# Liefert 0, wenn openHAB eine Persistence-Konfiguration fuer den Dienst
# geladen hat. Braucht OH_API_TOKEN (der Endpunkt verlangt Admin-Rechte);
# ohne Token 1 - Aufrufer behandeln das als "unbekannt".
persistence_config_loaded() {
  local svc="$1" code
  case "${OH_API_TOKEN:-}" in oh.*) ;; *) return 1 ;; esac
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
    -H "Authorization: Bearer $OH_API_TOKEN" \
    "http://127.0.0.1:8080/rest/persistence/$svc" || true)"
  [ "$code" = "200" ]
}

# Stellt sicher, dass openHAB geschriebene .persist-Modelle wirklich anwendet.
# 02 traegt die Persistence-Addons nur in addons.cfg ein und openHAB
# installiert sie asynchron - ein .persist, das vor dem Dienst geschrieben
# wurde, bleibt sonst stumm wirkungslos: kein restoreOnStartup, keine
# Diagramme, und /rest/persistence/<dienst> liefert 404 (beobachtet auf
# openHAB 5.2). Deshalb: auf die Feature-Installation warten und die Datei
# per touch neu einlesen lassen, sobald der Dienst da ist. Mit OH_API_TOKEN
# wird zum Schluss geprueft, ob die Konfiguration angekommen ist.
persistence_activate() {
  local svc pfile waited
  for svc in "$@"; do
    pfile="$OPENHAB_CONF/persistence/${svc}.persist"
    [ -f "$pfile" ] || continue

    if persistence_config_loaded "$svc"; then
      log "Persistence-Konfiguration '${svc}' ist aktiv."
      continue
    fi

    wait_for_addon "openhab-persistence-${svc}" || true
    touch "$pfile"
    log "${svc}.persist neu eingelesen lassen (touch)."

    case "${OH_API_TOKEN:-}" in
      oh.*)
        waited=0
        until persistence_config_loaded "$svc"; do
          if [ "$waited" -ge 60 ]; then
            warn "openHAB meldet keine Persistence-Konfiguration fuer '${svc}'."
            warn "openHAB neu starten (sudo systemctl restart openhab.service)"
            warn "und danach pruefen: sudo $IBM_SETUP_DIR/06-verify.sh"
            break
          fi
          sleep 5
          waited=$((waited + 5))
        done
        [ "$waited" -lt 60 ] && log "Persistence-Konfiguration '${svc}' ist aktiv."
        ;;
      *)
        log "Kein API-Token - ob '${svc}' die Konfiguration geladen hat, prueft 06-verify.sh."
        ;;
    esac
  done
  # Probleme wurden bereits als Warnung gemeldet - den Installationslauf
  # brechen sie nicht ab.
  return 0
}

# ---------------------------------------------------------------------------
# Karaf-Konsole und openHAB REST API
# ---------------------------------------------------------------------------

sha256_upper() { printf '%s' "$1" | sha256sum | cut -d' ' -f1 | tr 'a-z' 'A-Z'; }

# Wie muss ein Konsolen-Passwort in users.properties abgelegt werden?
# Gibt den Speicherwert aus: gehasht ({CRYPT}SHA-256{CRYPT}), wenn die
# Verschluesselung an ist, sonst Klartext.
karaf_stored_password() {
  local password="$1" jaas_cfg="$OPENHAB_USERDATA/etc/org.apache.karaf.jaas.cfg"
  if grep -qE '^[[:space:]]*encryption\.enabled[[:space:]]*=[[:space:]]*true' "$jaas_cfg" 2>/dev/null \
     && grep -qE '^[[:space:]]*encryption\.algorithm[[:space:]]*=[[:space:]]*SHA-256' "$jaas_cfg" 2>/dev/null; then
    printf '{CRYPT}%s{CRYPT}' "$(sha256_upper "$password")"
  else
    printf '%s' "$password"
  fi
}

# Fuehrt ein Kommando auf der Karaf-Konsole aus, ohne das Konsolen-Passwort
# zu kennen: als root wird in users.properties voruebergehend ein zufaelliges
# Passwort gesetzt und danach der alte Eintrag unveraendert wiederhergestellt.
# Die Konsole ist nur von localhost erreichbar; root kann den Eintrag ohnehin
# jederzeit aendern - das hier ist also keine Rechteausweitung.
console_exec() {
  local cmd="$1" up="$OPENHAB_USERDATA/etc/users.properties"
  local tmppw stored out rc
  [ -f "$up" ] || { warn "users.properties nicht gefunden: $up"; return 1; }
  command -v openhab-cli >/dev/null 2>&1 || { warn "openhab-cli nicht gefunden."; return 1; }

  tmppw="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  stored="$(karaf_stored_password "$tmppw")"

  cp -a "$up" "$up.ibm-console-tmp"
  sed -i -E "s|^([[:space:]]*openhab[[:space:]]*=[[:space:]]*)[^,]*|\1${stored}|" "$up"

  # Das Kommando ueber stdin in eine Konsolensitzung geben statt als
  # Argument: im Exec-Modus verschluckt der Karaf-Client die Ausgabe
  # mancher Kommandos (z. B. 'openhab:users addApiToken' - das Token wird
  # dann zwar erzeugt, aber nie angezeigt). Die Sitzung liefert alles
  # zuverlaessig; Farbcodes und Prompts werden herausgefiltert.
  out="$(printf '%s\nlogout\n' "$cmd" | timeout 120 openhab-cli console -p "$tmppw" 2>&1)"
  rc=$?

  mv "$up.ibm-console-tmp" "$up"
  printf '%s\n' "$out" | sed -e 's/\x1b\[[0-9;]*m//g'
  return "$rc"
}

# Sorgt fuer ein brauchbares openHAB-API-Token in OH_API_TOKEN und ibm.conf.
# Steht dort bereits ein echtes Token, passiert nichts. Bei "auto" oder leer
# wird ueber die Karaf-Konsole ein Token des ersten Admin-Benutzers erzeugt
# (Name "ibm"; ein vorhandenes Token dieses Namens wird ersetzt).
ensure_api_token() {
  case "${OH_API_TOKEN:-}" in
    oh.*) return 0 ;;
    ""|auto) ;;
    *) return 0 ;;
  esac

  local out admin_user token
  out="$(console_exec "openhab:users list")" \
    || { warn "Karaf-Konsole nicht erreichbar - kein API-Token erzeugt."; return 1; }
  admin_user="$(printf '%s\n' "$out" | grep -i 'administrator' | head -n1 | awk '{print $1}')"
  if [ -z "$admin_user" ]; then
    warn "Kein Admin-Benutzer in openHAB gefunden. Zuerst in der Main UI"
    warn "(http://<pi>:8080) das Admin-Konto anlegen, dann erneut ausfuehren."
    return 1
  fi

  console_exec "openhab:users rmApiToken $admin_user ibm" >/dev/null 2>&1 || true
  out="$(console_exec "openhab:users addApiToken $admin_user ibm admin")" || true
  token="$(printf '%s\n' "$out" | grep -oE 'oh\.[A-Za-z0-9._~/+-]+' | head -n1)"
  if [ -z "$token" ]; then
    warn "API-Token konnte nicht erzeugt werden. Konsolen-Ausgabe:"
    printf '%s\n' "$out" | sed 's/^/[IBM]   /' >&2
    warn "Ersatzweise in der Main UI ein Token erzeugen (Benutzername links"
    warn "unten -> 'Create new API token') und als OH_API_TOKEN in ibm.conf"
    warn "eintragen."
    return 1
  fi

  OH_API_TOKEN="$token"
  conf_set OH_API_TOKEN "$token"
  chmod 600 "$IBM_CONF" 2>/dev/null || true
  log "openHAB-API-Token 'ibm' fuer Benutzer '$admin_user' erzeugt und in ibm.conf eingetragen."
}

# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

# Setzt einen Schluessel in services/runtime.cfg. Eintraege dort gehen der
# Main-UI-Einstellung vor. Idempotent; geaenderte Datei wird gesichert.
runtime_cfg_set() {
  local key="$1" value="$2" cfg="$OPENHAB_CONF/services/runtime.cfg"
  if [ -f "$cfg" ] && grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$cfg"; then
    if grep -qE "^[[:space:]]*${key}[[:space:]]*=[[:space:]]*${value}[[:space:]]*$" "$cfg"; then
      log "${key} bereits ${value} ($cfg)."
    else
      cp -a "$cfg" "$cfg.bak-$(date +%Y%m%d%H%M%S)"
      sed -i -E "s|^[[:space:]]*${key}[[:space:]]*=.*|${key}=${value}|" "$cfg"
      log "${key}=${value} gesetzt ($cfg)."
    fi
  else
    mkdir -p "$(dirname "$cfg")"
    [ -f "$cfg" ] || : > "$cfg"
    printf '%s=%s\n' "$key" "$value" >> "$cfg"
    chown "$OPENHAB_USER:$OPENHAB_GROUP" "$cfg" 2>/dev/null || true
    log "${key}=${value} gesetzt ($cfg)."
  fi
}

# Setzt System- und openHAB-Zeitzone, damit die zeitgesteuerten Regeln in
# lokaler Zeit laufen. Idempotent; Vorgabe ueberschreibbar mit IBM_TIMEZONE.
ensure_timezone() {
  local tz="${1:-${IBM_TIMEZONE:-Europe/Vienna}}"

  # Systemzeitzone (timedatectl fehlt z. B. in Containern)
  if command -v timedatectl >/dev/null 2>&1; then
    local current
    current="$(timedatectl show --property=Timezone --value 2>/dev/null || true)"
    if [ "$current" = "$tz" ]; then
      log "Systemzeitzone bereits $tz."
    else
      timedatectl set-timezone "$tz" \
        && log "Systemzeitzone gesetzt: $tz (war: ${current:-unbekannt})" \
        || warn "Systemzeitzone konnte nicht gesetzt werden."
    fi
  else
    warn "timedatectl nicht gefunden - Systemzeitzone nicht gesetzt."
  fi

  runtime_cfg_set "org.openhab.i18n:timezone" "$tz"

  # JVM-Zeitzone des openHAB-Dienstes: das openHABian-Image liefert in
  # /etc/default/openhab ein hartes -Duser.timezone=Europe/London mit.
  # Damit laufen Logs und zeitgesteuerte Regeln eine Stunde daneben, egal
  # was Systemzeitzone und org.openhab.i18n sagen - deshalb hier ersetzen.
  local defaults="/etc/default/openhab"
  if [ -f "$defaults" ] && grep -qE '^[^#]*-Duser\.timezone=' "$defaults"; then
    if grep -qE "^[^#]*-Duser\.timezone=$tz([\" ]|\$)" "$defaults"; then
      log "JVM-Zeitzone bereits $tz ($defaults)."
    else
      cp -a "$defaults" "$defaults.bak-$(date +%Y%m%d%H%M%S)"
      sed -i -E "/^[^#]*EXTRA_JAVA_OPTS=/ s#-Duser\.timezone=[^\" ]+#-Duser.timezone=$tz#" "$defaults"
      log "JVM-Zeitzone in $defaults auf $tz gesetzt."
      if systemctl is-active --quiet openhab.service 2>/dev/null; then
        systemctl restart openhab.service \
          && log "openHAB neu gestartet, damit die JVM-Zeitzone greift." \
          || warn "openHAB-Neustart fehlgeschlagen - bitte manuell: sudo systemctl restart openhab.service"
      fi
    fi
  fi
}

# Setzt Zeitzone, Sprache, Region und Masssystem - das, was sonst der
# Ersteinrichtungs-Assistent der Main UI erledigt; der kann damit einfach
# uebersprungen werden. Vorgaben ueberschreibbar mit IBM_TIMEZONE,
# IBM_LANGUAGE und IBM_REGION.
ensure_regional_settings() {
  ensure_timezone
  runtime_cfg_set "org.openhab.i18n:language" "${IBM_LANGUAGE:-de}"
  runtime_cfg_set "org.openhab.i18n:region" "${IBM_REGION:-AT}"
  runtime_cfg_set "org.openhab.i18n:measurementSystem" "SI"
}

# ---------------------------------------------------------------------------
# Dateien
# ---------------------------------------------------------------------------

# Datei aus stdin schreiben - idempotent, mit Backup und korrekten Rechten.
# Verwendung:  irgendwas | install_file /pfad/zur/datei
install_file() {
  local target="$1"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"

  if [ -f "$target" ] && cmp -s "$tmp" "$target"; then
    log "unveraendert: $target"
    rm -f "$tmp"
    return 0
  fi

  if [ -f "$target" ]; then
    local backup="$target.bak-$(date +%Y%m%d%H%M%S)"
    cp -a "$target" "$backup"
    log "Backup angelegt: $backup"
  fi

  mkdir -p "$(dirname "$target")"
  cat "$tmp" > "$target"
  rm -f "$tmp"
  chown "$OPENHAB_USER:$OPENHAB_GROUP" "$target" 2>/dev/null || \
    warn "chown auf $OPENHAB_USER:$OPENHAB_GROUP fehlgeschlagen: $target"
  chmod 0644 "$target"
  log "geschrieben: $target"
}

openhab_restart() {
  if command -v systemctl >/dev/null 2>&1; then
    log "openHAB wird neu gestartet ..."
    systemctl restart openhab.service && log "openHAB neu gestartet." \
      || warn "Neustart fehlgeschlagen - bitte manuell: sudo systemctl restart openhab.service"
  else
    warn "systemctl nicht gefunden - bitte openHAB manuell neu starten."
  fi
}
