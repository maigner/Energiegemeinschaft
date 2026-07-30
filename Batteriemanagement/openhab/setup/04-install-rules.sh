#!/usr/bin/env bash
# ============================================================================
# 04 - Regeln: verpackt die IBM-Skripte als zeitgesteuerte JS-Regeln.
#
# Die Skripte unter ../eeg-api und ../fronius sind reine Skriptkoerper, wie
# sie in der Main UI als "Script Action" eingefuegt werden. Fuer den
# dateibasierten Betrieb werden sie hier in rules.JSRule(...) mit einem
# Cron-Trigger eingebettet und dabei anlagenspezifisch parametrisiert.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

js_dir="$OPENHAB_CONF/automation/js"
mkdir -p "$js_dir"
chown "$OPENHAB_USER:$OPENHAB_GROUP" "$js_dir" 2>/dev/null || true

# Sonderzeichen fuer die rechte Seite eines sed-Ausdrucks entschaerfen.
sed_escape() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }

api_base_esc="$(sed_escape "$IBM_API_BASE")"
thing_uid_esc="$(sed_escape "$INVERTER_THING_UID")"
soc_item_esc="$(sed_escape "$SOC_ITEM")"

# Suchmuster aus dem Wechselrichter-Profil (linke Seite eines sed-Ausdrucks).
thing_prefix_pat="$(printf '%s' "$INVERTER_THING_PREFIX" | sed -e 's/[][\.*^$|]/\\&/g')"
soc_placeholder_pat="$(printf '%s' "$INVERTER_SOC_PLACEHOLDER" | sed -e 's/[][\.*^$|]/\\&/g')"

# Skriptkoerper einlesen und anlagenspezifische Werte einsetzen.
render_payload() {
  sed -e "s|https://ischlstrom\.org|${api_base_esc}|g" \
      -e "s|${thing_prefix_pat}:[^']*|${thing_uid_esc}|g" \
      -e "s|${soc_placeholder_pat}|${soc_item_esc}|g" \
      "$1"
}

# Erzeugt eine Regeldatei aus einem Skriptkoerper.
#   $1 Quelldatei  $2 Zieldatei  $3 Regel-ID  $4 Name  $5 Beschreibung  $6 Cron
generate_rule() {
  local src="$1" target="$2" rule_id="$3" name="$4" desc="$5" cron="$6"

  [ -f "$src" ] || die "Quellskript fehlt: $src"

  {
    echo "// ==========================================================================="
    echo "// GENERIERT von 04-install-rules.sh - nicht direkt bearbeiten."
    echo "// Quelle: ${src}"
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
  "$IBM_SCRIPT_DIR/$INVERTER_CONTROL_SCRIPT" \
  "$js_dir/ibm_battery_control.js" \
  "ibm_battery_control" \
  "IBM - Batteriesteuerung (${INVERTER_TYPE})" \
  "Ladesperre am Vormittag und forcierte Entladung in der Nacht" \
  "$CRON_BATTERY"

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
      'IBM_LADESPERRE_START': ${DEFAULT_LADESPERRE_START},
      'IBM_LADESPERRE_ENDE': ${DEFAULT_LADESPERRE_ENDE},
      'IBM_LADESPERRE_WOLKEN_SCHWELLE': ${DEFAULT_WOLKEN_SCHWELLE},
      'IBM_ENTLADUNG_AKTIV': '${DEFAULT_ENTLADUNG_AKTIV}',
      'IBM_ENTLADUNG_START': ${DEFAULT_ENTLADUNG_START},
      'IBM_ENTLADUNG_ENDE': ${DEFAULT_ENTLADUNG_ENDE}
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
  if [ -z "$OH_API_TOKEN" ]; then
    warn "OH_API_TOKEN fehlt in ibm.conf - Watchdog uebersprungen."
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
