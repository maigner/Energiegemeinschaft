#!/usr/bin/env bash
# ============================================================================
# 03 - Items und Persistence fuer das Batteriemanagement.
#
# Legt NICHT das SoC-Item an - das entsteht beim Verknuepfen des soc-Channels
# des Fronius Things in der Main UI und wird hier nur referenziert.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

# --- Items ------------------------------------------------------------------
install_file "$OPENHAB_CONF/items/ibm.items" <<EOF
// ============================================================================
// ISCHLSTROM Batteriemanagement (IBM)
// GENERIERT von 03-install-items.sh - Aenderungen gehen beim naechsten Lauf
// verloren. Anpassungen stattdessen im Setup-Skript vornehmen.
//
// Nicht enthalten: ${SOC_ITEM}
// Dieses Item entsteht beim Verknuepfen des soc-Channels in der Main UI.
// ============================================================================

// Hauptschalter - ohne ON tut die Steuerung nichts
Switch Schalte_ISCHLSTROM_Empfehlung_einaus "Batteriemanagement aktivieren" <switch> (IBM)

// Von der ischlstrom API befuellt
Number Ischlstrom_Wolkenvorschau      "Bewoelkungsvorhersage [%.0f %%]" <sun>  (IBM)
String Ischlstrom_Wolkenvorschau_Zeit "Wolkenvorschau abgerufen [%s]"   <time> (IBM)
String Ischlstrom_Crossover_Start     "Crossover Start [%s]"            <time> (IBM)
String Ischlstrom_Crossover_Ende      "Crossover Ende [%s]"             <time> (IBM)

// Vom Mitglied einstellbar
Number IBM_MIN_BATTERY_CHARGE                       "Minimaler Ladestand Batterie [%.0f %%]" <batterylevel> (IBM)
Number Minimale_Entladeleistung_Batterieeinspeisung "Minimale Entladeleistung [%.0f W]"      <energy>       (IBM)
Number Maximale_Entladeleistung_Batterieeinspeisung "Maximale Entladeleistung [%.0f W]"      <energy>       (IBM)

// Ladesperre am Vormittag
Switch IBM_LADESPERRE_AKTIV            "Ladesperre bei Sonnenprognose"      <switch> (IBM)
Number IBM_LADESPERRE_START            "Ladesperre ab [%.0f Uhr]"           <time>   (IBM)
Number IBM_LADESPERRE_ENDE             "Ladesperre bis [%.0f Uhr]"          <time>   (IBM)
Number IBM_LADESPERRE_WOLKEN_SCHWELLE  "Wolken-Schwelle Ladesperre [%.0f %%]" <sun>  (IBM)

// Forcierte Entladung in der Nacht
Switch IBM_ENTLADUNG_AKTIV             "Forcierte Entladung nachts"         <switch> (IBM)
Number IBM_ENTLADUNG_START             "Entladung ab [%.0f Uhr]"            <time>   (IBM)
Number IBM_ENTLADUNG_ENDE              "Entladung bis [%.0f Uhr]"           <time>   (IBM)
EOF

# --- Persistence ------------------------------------------------------------
# Ohne restoreOnStartup stehen die Einstellungen nach einem Neustart auf NULL
# und die Steuerung bricht mit "invalid value" ab.
if [ "$INSTALL_PERSISTENCE" = "1" ]; then
  install_file "$OPENHAB_CONF/persistence/mapdb.persist" <<'EOF'
// ============================================================================
// ISCHLSTROM Batteriemanagement (IBM)
// GENERIERT von 03-install-items.sh
//
// Sichert die Einstellungen und die zuletzt geholten API-Werte, damit sie
// einen Neustart ueberleben. Die Wolkenvorschau ist trotzdem sicher: die
// Steuerung prueft ueber Ischlstrom_Wolkenvorschau_Zeit, ob sie veraltet ist.
// ============================================================================

Strategies {
    default = everyChange
}

Items {
    Schalte_ISCHLSTROM_Empfehlung_einaus,
    Ischlstrom_Wolkenvorschau,
    Ischlstrom_Wolkenvorschau_Zeit,
    Ischlstrom_Crossover_Start,
    Ischlstrom_Crossover_Ende,
    IBM_MIN_BATTERY_CHARGE,
    Minimale_Entladeleistung_Batterieeinspeisung,
    Maximale_Entladeleistung_Batterieeinspeisung,
    IBM_LADESPERRE_AKTIV,
    IBM_LADESPERRE_START,
    IBM_LADESPERRE_ENDE,
    IBM_LADESPERRE_WOLKEN_SCHWELLE,
    IBM_ENTLADUNG_AKTIV,
    IBM_ENTLADUNG_START,
    IBM_ENTLADUNG_ENDE
        : strategy = everyChange, restoreOnStartup
}
EOF
else
  log "INSTALL_PERSISTENCE=0 - Persistence uebersprungen."
  warn "Ohne Persistence stehen die Einstellungen nach einem Neustart auf NULL."
fi

log "Items installiert."
