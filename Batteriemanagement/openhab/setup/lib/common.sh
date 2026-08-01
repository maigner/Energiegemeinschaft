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

  # SSH-Haertung (aeltere ibm.conf kennt die Option noch nicht)
  INSTALL_SSH_HARDENING="${INSTALL_SSH_HARDENING:-0}"

  load_profile "$INVERTER_TYPE"
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

# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

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

  # Regionaleinstellung von openHAB. Der Eintrag in runtime.cfg geht der
  # Main-UI-Einstellung (Settings -> Regional Settings) vor.
  local cfg="$OPENHAB_CONF/services/runtime.cfg" key="org.openhab.i18n:timezone"
  if [ -f "$cfg" ] && grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$cfg"; then
    if grep -qE "^[[:space:]]*${key}[[:space:]]*=[[:space:]]*${tz}[[:space:]]*$" "$cfg"; then
      log "openHAB-Zeitzone bereits $tz ($cfg)."
    else
      cp -a "$cfg" "$cfg.bak-$(date +%Y%m%d%H%M%S)"
      sed -i -E "s|^[[:space:]]*${key}[[:space:]]*=.*|${key}=${tz}|" "$cfg"
      log "openHAB-Zeitzone gesetzt: $tz ($cfg)."
    fi
  else
    mkdir -p "$(dirname "$cfg")"
    [ -f "$cfg" ] || : > "$cfg"
    printf '%s=%s\n' "$key" "$tz" >> "$cfg"
    chown "$OPENHAB_USER:$OPENHAB_GROUP" "$cfg" 2>/dev/null || true
    log "openHAB-Zeitzone gesetzt: $tz ($cfg)."
  fi
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
