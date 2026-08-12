#!/usr/bin/env bash
# ============================================================================
# 04 - Regeln: verpackt die IBM-Skripte als zeitgesteuerte JS-Regeln.
#
# Die Skripte unter ../eeg-api, ../control und ../inverters sind reine
# Skriptkoerper, wie sie in der Main UI als "Script Action" eingefuegt
# werden. Fuer den dateibasierten Betrieb werden sie hier in
# rules.JSRule(...) mit einem Cron-Trigger eingebettet und dabei
# anlagenspezifisch parametrisiert. Die Batteriesteuerung besteht aus dem
# Wechselrichter-Adapter des Profils gefolgt vom gemeinsamen Kern
# (control/core.js) im selben Regel-Body.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

# --- Status-Push: bei Bedarf nachfragen (aeltere ibm.conf) -------------------
# Das Token erzeugt der Vorstand auf ischlstrom.org unter /board/openhab.
# Stammt die ibm.conf von vor dem Status-Push (INSTALL_STATUS_PUSH fehlt)
# oder ist der Push gewollt, aber ohne Token, wird hier einmalig nachgefragt
# und die Antwort in die ibm.conf uebernommen - ein Paket-Update genuegt so
# zum Nachruesten. Eine bewusste Ablehnung (INSTALL_STATUS_PUSH=0) bleibt
# unangetastet.
status_unconfigured=0
[ -z "${INSTALL_STATUS_PUSH:-}" ] && status_unconfigured=1
INSTALL_STATUS_PUSH="${INSTALL_STATUS_PUSH:-0}"
IBM_ANLAGE_NAME="${IBM_ANLAGE_NAME:-}"
IBM_STATUS_TOKEN="${IBM_STATUS_TOKEN:-}"
CRON_STATUS="${CRON_STATUS:-0 2/5 * * * ?}"

# NAME=VALUE in der ibm.conf setzen (bestehende Zeile ersetzen, sonst anhaengen).
conf_set() {
  local name="$1" value="$2" repl
  repl="$(printf '%s=%s' "$name" "$value" | sed -e 's/[\\&|]/\\&/g')"
  if grep -q "^${name}=" "$IBM_CONF"; then
    sed -i "s|^${name}=.*|${repl}|" "$IBM_CONF"
  else
    printf '%s=%s\n' "$name" "$value" >> "$IBM_CONF"
  fi
}

status_needs_input=0
if [ "$status_unconfigured" = "1" ] || { [ "$INSTALL_STATUS_PUSH" = "1" ] && [ -z "$IBM_STATUS_TOKEN" ]; }; then
  status_needs_input=1
fi

if [ "$status_needs_input" = "1" ] && [ "${IBM_ASSUME_YES:-0}" = "1" ]; then
  # Unbeaufsichtigtes Update: nichts festschreiben, damit ein spaeterer
  # interaktiver Lauf die Frage stellen kann. Ohne Token laeuft kein Push.
  log "Status-Push nicht konfiguriert (kein Token) - uebersprungen (IBM_ASSUME_YES=1)."
  INSTALL_STATUS_PUSH=0
elif [ "$status_needs_input" = "1" ]; then
  echo "[IBM]"
  echo "[IBM] Die Anlage kann alle 5 Minuten ihren Zustand (Ladestand, Status des"
  echo "[IBM] Wechselrichters, Einstellungen) an ischlstrom.org melden. Der"
  echo "[IBM] Vorstand sieht alle Anlagen dann auf einem Dashboard und erkennt"
  echo "[IBM] Ausfaelle frueh. Dafuer wird das Status-Token dieser Anlage"
  echo "[IBM] benoetigt - der Vorstand erzeugt es auf ischlstrom.org unter"
  echo "[IBM] /board/openhab (je Mitglied)."
  if confirm "Anlagenstatus an ischlstrom.org melden?"; then
    ask IBM_STATUS_TOKEN "Status-Token dieser Anlage (leer = ueberspringen)" "$IBM_STATUS_TOKEN"
  fi
  if [ -n "$IBM_STATUS_TOKEN" ]; then
    INSTALL_STATUS_PUSH=1
    ask IBM_ANLAGE_NAME "Name der Anlage (erscheint am Dashboard)" "${IBM_ANLAGE_NAME:-$(hostname)}"
  else
    INSTALL_STATUS_PUSH=0
    warn "Kein Token - Status-Push bleibt aus. Nachruesten: Token am Dashboard"
    warn "erzeugen, INSTALL_STATUS_PUSH=1 und IBM_STATUS_TOKEN in ibm.conf"
    warn "eintragen und dieses Skript erneut ausfuehren."
  fi
  conf_set INSTALL_STATUS_PUSH "$INSTALL_STATUS_PUSH"
  conf_set IBM_STATUS_TOKEN "\"$IBM_STATUS_TOKEN\""
  conf_set IBM_ANLAGE_NAME "\"$IBM_ANLAGE_NAME\""
  log "Status-Push-Einstellungen in ibm.conf uebernommen."
fi

if [ "$INSTALL_STATUS_PUSH" = "1" ] && [ -z "$IBM_ANLAGE_NAME" ]; then
  IBM_ANLAGE_NAME="$(hostname)"
fi

js_dir="$OPENHAB_CONF/automation/js"
mkdir -p "$js_dir"
chown "$OPENHAB_USER:$OPENHAB_GROUP" "$js_dir" 2>/dev/null || true

# Sonderzeichen fuer die rechte Seite eines sed-Ausdrucks entschaerfen.
sed_escape() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }

api_base_esc="$(sed_escape "$IBM_API_BASE")"
thing_uid_esc="$(sed_escape "$INVERTER_THING_UID")"
soc_item_esc="$(sed_escape "$SOC_ITEM")"
battery_power_item_esc="$(sed_escape "$BATTERY_POWER_ITEM")"
anlage_name_esc="$(sed_escape "$IBM_ANLAGE_NAME")"
status_token_esc="$(sed_escape "$IBM_STATUS_TOKEN")"
inverter_type_esc="$(sed_escape "$INVERTER_TYPE")"
logdir_esc="$(sed_escape "$OPENHAB_LOGDIR")"

# Suchmuster aus dem Wechselrichter-Profil (linke Seite eines sed-Ausdrucks).
soc_placeholder_pat="$(printf '%s' "$INVERTER_SOC_PLACEHOLDER" | sed -e 's/[][\.*^$|]/\\&/g')"

# Skriptkoerper einlesen und anlagenspezifische Werte einsetzen. Neben den
# gewachsenen Mustern (URL, SoC-Platzhalter des Profils) werden die
# expliziten @...@-Platzhalter ersetzt. Skripte referenzieren Thing-UIDs
# ausschliesslich ueber @IBM_THING_UID@ - ein frueherer sed, der jedes
# Literal mit dem Thing-Praefix ersetzte, wuerde Skripte mit mehreren
# Thing-UIDs (z. B. einem Modbus-Baum) auf eine einzige UID kollabieren.
render_payload() {
  sed -e "s|https://ischlstrom\.org|${api_base_esc}|g" \
      -e "s|${soc_placeholder_pat}|${soc_item_esc}|g" \
      -e "s|@IBM_THING_UID@|${thing_uid_esc}|g" \
      -e "s|@IBM_SOC_ITEM@|${soc_item_esc}|g" \
      -e "s|@IBM_BATTERY_POWER_ITEM@|${battery_power_item_esc}|g" \
      -e "s|@IBM_ANLAGE_NAME@|${anlage_name_esc}|g" \
      -e "s|@IBM_STATUS_TOKEN@|${status_token_esc}|g" \
      -e "s|@IBM_INVERTER_TYPE@|${inverter_type_esc}|g" \
      -e "s|@IBM_LOG_DIR@|${logdir_esc}|g" \
      "$1"
}

# Erzeugt eine Regeldatei aus einem Skriptkoerper.
#   $1 Quelldatei  $2 Zieldatei  $3 Regel-ID  $4 Name  $5 Beschreibung  $6 Cron
#   $7 (optional) abweichende Quellenangabe im Kopfkommentar
generate_rule() {
  local src="$1" target="$2" rule_id="$3" name="$4" desc="$5" cron="$6"
  local src_display="${7:-$src}"

  [ -f "$src" ] || die "Quellskript fehlt: $src"

  {
    echo "// ==========================================================================="
    echo "// GENERIERT von 04-install-rules.sh - nicht direkt bearbeiten."
    echo "// Quelle: ${src_display}"
    echo "// Aenderungen im Repository vornehmen und das Setup erneut ausfuehren."
    echo "// ==========================================================================="
    echo "rules.JSRule({"
    echo "  id: '${rule_id}',"
    echo "  name: '${name}',"
    echo "  description: '${desc}',"
    echo "  tags: ['IBM'],"
    echo "  triggers: [triggers.GenericCronTrigger('${cron}')],"
    echo "  execute: (event) => {"
    render_payload "$src"
    echo "  }"
    echo "});"
  } | install_file "$target"
}

generate_rule \
  "$IBM_SCRIPT_DIR/eeg-api/cloud_forecast.js" \
  "$js_dir/ibm_cloud_forecast.js" \
  "ibm_cloud_forecast" \
  "IBM - Wolkenvorschau abholen" \
  "Holt die Bewoelkungsvorhersage von der ischlstrom API" \
  "$CRON_CLOUD"

generate_rule \
  "$IBM_SCRIPT_DIR/eeg-api/crossover.js" \
  "$js_dir/ibm_crossover.js" \
  "ibm_crossover" \
  "IBM - Crossover-Zeiten abholen" \
  "Holt Start- und Endzeit des Crossover-Fensters von der ischlstrom API" \
  "$CRON_CROSSOVER"

generate_rule \
  "$IBM_SCRIPT_DIR/eeg-api/ladefenster.js" \
  "$js_dir/ibm_ladesperre.js" \
  "ibm_ladesperre" \
  "IBM - Ladesperre-Fenster abholen" \
  "Holt das Ladesperre-Fenster aus der Tagesprognose der ischlstrom API" \
  "$CRON_LADESPERRE"

# Batteriesteuerung: im Adapter-Modus werden der Wechselrichter-Adapter des
# Profils und der gemeinsame Kern (control/core.js) in denselben Regel-Body
# gesetzt - der Adapter definiert ibmReset/ibmPreventCharge/ibmForceDischarge,
# der Kern ruft sie auf. Legacy-Profile liefern weiterhin ein einzelnes,
# eigenstaendiges Steuerungsskript.
if [ "$IBM_CONTROL_MODE" = "adapter" ]; then
  adapter_src="$IBM_SCRIPT_DIR/$INVERTER_ADAPTER_SCRIPT"
  core_src="$IBM_SCRIPT_DIR/control/core.js"
  [ -f "$adapter_src" ] || die "Adapter-Skript fehlt: $adapter_src"
  [ -f "$core_src" ] || die "Steuerungskern fehlt: $core_src"

  control_src="$(mktemp)"
  {
    echo "// --- Adapter (${INVERTER_TYPE}): ${INVERTER_ADAPTER_SCRIPT} ---------------"
    cat "$adapter_src"
    echo ""
    echo "// --- Kern: control/core.js ------------------------------------------------"
    cat "$core_src"
  } > "$control_src"

  generate_rule \
    "$control_src" \
    "$js_dir/ibm_battery_control.js" \
    "ibm_battery_control" \
    "IBM - Batteriesteuerung (${INVERTER_TYPE})" \
    "Ladesperre am Vormittag und forcierte Entladung in der Nacht" \
    "$CRON_BATTERY" \
    "${INVERTER_ADAPTER_SCRIPT} + control/core.js"
  rm -f "$control_src"
else
  generate_rule \
    "$IBM_SCRIPT_DIR/$INVERTER_CONTROL_SCRIPT" \
    "$js_dir/ibm_battery_control.js" \
    "ibm_battery_control" \
    "IBM - Batteriesteuerung (${INVERTER_TYPE})" \
    "Ladesperre am Vormittag und forcierte Entladung in der Nacht" \
    "$CRON_BATTERY"
fi

# --- Status-Push an das Vorstands-Dashboard ---------------------------------
if [ "$INSTALL_STATUS_PUSH" = "1" ]; then
  generate_rule \
    "$IBM_SCRIPT_DIR/eeg-api/status_push.js" \
    "$js_dir/ibm_status_push.js" \
    "ibm_status_push" \
    "IBM - Status an ischlstrom melden" \
    "Meldet den Anlagenzustand an das Vorstands-Dashboard auf ischlstrom.org" \
    "$CRON_STATUS"
else
  log "INSTALL_STATUS_PUSH=0 - Status-Push uebersprungen."
fi

# --- Initialisierung der Konfigurations-Items -------------------------------
# Setzt Startwerte, solange ein Item noch NULL/UNDEF ist. Damit ist eine
# frische Installation sofort betriebsbereit; spaetere Aenderungen des
# Mitglieds bleiben unangetastet.
install_file "$js_dir/ibm_init.js" <<EOF
// ===========================================================================
// GENERIERT von 04-install-rules.sh - nicht direkt bearbeiten.
// Initialisiert die Konfigurations-Items mit Startwerten aus ibm.conf.
// ===========================================================================
rules.JSRule({
  id: 'ibm_init_defaults',
  name: 'IBM - Konfigurations-Items initialisieren',
  description: 'Setzt Startwerte, solange ein Item noch NULL oder UNDEF ist',
  tags: ['IBM'],
  triggers: [triggers.GenericCronTrigger('${CRON_INIT}')],
  execute: (event) => {
    var defaults = {
      'Schalte_ISCHLSTROM_Empfehlung_einaus': 'OFF',
      'IBM_MIN_BATTERY_CHARGE': ${DEFAULT_MIN_BATTERY_CHARGE},
      'Minimale_Entladeleistung_Batterieeinspeisung': ${DEFAULT_MIN_DISCHARGE_W},
      'Maximale_Entladeleistung_Batterieeinspeisung': ${DEFAULT_MAX_DISCHARGE_W},
      'IBM_LADESPERRE_AKTIV': '${DEFAULT_LADESPERRE_AKTIV}',
      'IBM_LADESPERRE_WOLKEN_SCHWELLE': ${DEFAULT_WOLKEN_SCHWELLE},
      'IBM_ENTLADUNG_AKTIV': '${DEFAULT_ENTLADUNG_AKTIV}',
      'IBM_DYNAMISCHE_LEISTUNG': '${DEFAULT_DYNAMISCHE_LEISTUNG}',
      'IBM_PAUSE_TAGE': 0
    };

    Object.keys(defaults).forEach(function (name) {
      var item = null;
      try {
        item = items.getItem(name);
      } catch (e) {
        item = null;
      }
      if (item === null || item === undefined) {
        console.error('[IBM][Init] Item fehlt: ' + name);
        return;
      }
      var state = String(item.state);
      if (state === 'NULL' || state === 'UNDEF') {
        item.postUpdate(defaults[name]);
        console.log('[IBM][Init] ' + name + ' initialisiert: ' + defaults[name]);
      }
    });
  }
});
EOF

# --- Pause herunterzaehlen --------------------------------------------------
# Die Unterseite "IBM pausieren" setzt IBM_PAUSE_TAGE; solange der Wert > 0
# ist, plant die Batteriesteuerung nichts. Diese Regel zaehlt ihn jede Nacht
# um 1 herunter - bei 0 laeuft die Steuerung von selbst wieder an.
install_file "$js_dir/ibm_pause.js" <<EOF
// ===========================================================================
// GENERIERT von 04-install-rules.sh - nicht direkt bearbeiten.
// Zaehlt die IBM-Pause (IBM_PAUSE_TAGE) jede Nacht um 1 herunter.
// ===========================================================================
rules.JSRule({
  id: 'ibm_pause_countdown',
  name: 'IBM - Pause herunterzaehlen',
  description: 'Zaehlt die verbleibenden Pausentage jede Nacht um 1 herunter',
  tags: ['IBM'],
  triggers: [triggers.GenericCronTrigger('${CRON_PAUSE}')],
  execute: (event) => {
    var item = null;
    try {
      item = items.getItem('IBM_PAUSE_TAGE');
    } catch (e) {
      item = null;
    }
    if (item === null || item === undefined) {
      console.error('[IBM][Pause] Item fehlt: IBM_PAUSE_TAGE');
      return;
    }
    var days = parseFloat(item.numericState);
    if (isNaN(days) || days <= 0) return;
    var next = Math.max(0, Math.round(days) - 1);
    item.postUpdate(next);
    console.log('[IBM][Pause] Verbleibende Pausentage: ' + next + (next === 0 ? ' - IBM arbeitet wieder' : ''));
  }
});
EOF

# --- Netzwerk-Watchdog ------------------------------------------------------
# Ueberwacht das Thing mit der Netzwerkadresse (bei Fronius die Bridge) und
# startet bei OFFLINE die Netzwerksuche aus dem Wechselrichter-Profil, die
# eine per DHCP geaenderte IP findet und per REST API in das Thing eintraegt.
install_watchdog() {
  local src="$IBM_SCRIPT_DIR/$INVERTER_REDISCOVER_SCRIPT"
  local state_dir="$OPENHAB_USERDATA/ibm"
  local token_file="$state_dir/api_token"
  local script_target="$OPENHAB_CONF/scripts/ibm_rediscover.sh"

  if [ -z "$INVERTER_REDISCOVER_SCRIPT" ] || [ ! -f "$src" ]; then
    warn "Profil '$INVERTER_TYPE' hat keine Netzwerksuche - Watchdog uebersprungen."
    return 0
  fi
  if [ -z "$INVERTER_HOST_THING_UID" ]; then
    warn "INVERTER_HOST_THING_UID fehlt in ibm.conf - Watchdog uebersprungen."
    return 0
  fi
  if [ "$OH_API_TOKEN" = "auto" ]; then
    ensure_api_token || true
  fi
  if [ -z "$OH_API_TOKEN" ] || [ "$OH_API_TOKEN" = "auto" ]; then
    warn "Kein brauchbares OH_API_TOKEN in ibm.conf - Watchdog uebersprungen."
    return 0
  fi

  # Arbeitsverzeichnis des Watchdogs (Token, gemerkte Seriennummer, Lock)
  mkdir -p "$state_dir"
  chown "$OPENHAB_USER:$OPENHAB_GROUP" "$state_dir" 2>/dev/null || true
  chmod 0700 "$state_dir"

  # Das Token gehoert nicht in eine weltlesbare Datei, daher nicht install_file.
  printf '%s\n' "$OH_API_TOKEN" > "$token_file"
  chown "$OPENHAB_USER:$OPENHAB_GROUP" "$token_file" 2>/dev/null || true
  chmod 0600 "$token_file"
  log "API-Token abgelegt: $token_file"

  sed -e "s|@IBM_HOST_THING_UID@|$(sed_escape "$INVERTER_HOST_THING_UID")|g" \
      -e "s|@IBM_HOST_PARAM@|$(sed_escape "$INVERTER_HOST_PARAM")|g" \
      -e "s|@IBM_TOKEN_FILE@|$(sed_escape "$token_file")|g" \
      -e "s|@IBM_STATE_DIR@|$(sed_escape "$state_dir")|g" \
      -e "s|@IBM_COOLDOWN_MIN@|$(sed_escape "$WATCHDOG_COOLDOWN_MIN")|g" \
      "$src" | install_file "$script_target"
  chmod 0755 "$script_target"

  install_file "$js_dir/ibm_watchdog.js" <<EOF
// ===========================================================================
// GENERIERT von 04-install-rules.sh - nicht direkt bearbeiten.
// Quelle der Netzwerksuche: $INVERTER_REDISCOVER_SCRIPT
// Aenderungen im Repository vornehmen und das Setup erneut ausfuehren.
// ===========================================================================
rules.JSRule({
  id: 'ibm_inverter_watchdog',
  name: 'IBM - Netzwerk-Watchdog (${INVERTER_TYPE})',
  description: 'Findet den Wechselrichter nach einem IP-Wechsel im Netz wieder',
  tags: ['IBM'],
  triggers: [
    triggers.ThingStatusChangeTrigger('${INVERTER_HOST_THING_UID}', 'OFFLINE'),
    triggers.GenericCronTrigger('${CRON_WATCHDOG}')
  ],
  execute: (event) => {
    // Das Skript prueft selbst Status, Abkuehlzeit und Identitaet -
    // im Normalbetrieb (Thing ONLINE) tut es nichts und gibt nichts aus.
    var out = actions.Exec.executeCommandLine(time.Duration.ofMinutes(5), '${script_target}');
    if (out) {
      String(out).split('\n').forEach(function (line) {
        if (line.trim().length > 0) { console.log(line); }
      });
    }
  }
});
EOF

  # Einmal sofort laufen lassen: prueft Token und REST-Zugriff und merkt sich
  # die Seriennummer des Wechselrichters, solange die Verbindung noch steht.
  if command -v runuser >/dev/null 2>&1; then
    log "Erster Watchdog-Lauf (prueft Token und merkt sich die Seriennummer) ..."
    runuser -u "$OPENHAB_USER" -- "$script_target" \
      | sed 's/^/[IBM]   /' \
      || warn "Erster Watchdog-Lauf fehlgeschlagen - siehe Meldungen oben."
  fi
}

if [ "$INSTALL_WATCHDOG" = "1" ]; then
  install_watchdog
else
  log "INSTALL_WATCHDOG=0 - Netzwerk-Watchdog uebersprungen."
fi

log "Regeln installiert in $js_dir"
log "openHAB laedt Dateien in diesem Verzeichnis automatisch neu."
