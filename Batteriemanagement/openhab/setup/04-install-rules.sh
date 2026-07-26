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

log "Regeln installiert in $js_dir"
log "openHAB laedt Dateien in diesem Verzeichnis automatisch neu."
