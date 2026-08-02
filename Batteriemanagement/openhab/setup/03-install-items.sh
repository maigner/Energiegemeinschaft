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

# --- Batterie-Items -----------------------------------------------------------
# Bei der automatischen Einrichtung (Thing-UID *:ibm:*) verwaltet IBM auch die
# Batterie-Items samt Channel-Verknuepfung - ganz ohne Main UI. Beim
# klassischen Weg entstehen sie dort beim Verknuepfen der Channels und werden
# hier nur referenziert.
battery_items=""
battery_note="// Nicht enthalten: ${SOC_ITEM}
// Dieses Item entsteht beim Verknuepfen des Ladestands-Channels in der Main UI."
case "$INVERTER_THING_UID" in
  *:ibm:*)
    battery_note="// Enthalten sind auch die Batterie-Items (automatische Einrichtung)."
    battery_items="
// Batterie-Items - verknuepft mit dem automatisch angelegten Thing
Number:Dimensionless ${SOC_ITEM} \"Ladestand Batterie [%.0f %%]\" <batterylevel> (IBM) { channel=\"${INVERTER_THING_UID}:${INVERTER_SOC_CHANNEL}\", unit=\"%\" }"
    if [ -n "$BATTERY_POWER_ITEM" ] && [ -n "$INVERTER_BATTERY_POWER_CHANNEL" ]; then
      battery_items="${battery_items}
Number:Power ${BATTERY_POWER_ITEM} \"Batterieleistung [%.0f W]\" <energy> (IBM) { channel=\"${INVERTER_THING_UID}:${INVERTER_BATTERY_POWER_CHANNEL}\", unit=\"W\" }"
    fi
    ;;
esac

# --- Items ------------------------------------------------------------------
install_file "$OPENHAB_CONF/items/ibm.items" <<EOF
// ============================================================================
// ISCHLSTROM Batteriemanagement (IBM)
// GENERIERT von 03-install-items.sh - Aenderungen gehen beim naechsten Lauf
// verloren. Anpassungen stattdessen im Setup-Skript vornehmen.
//
${battery_note}
// ============================================================================
${battery_items}

// Hauptschalter - ohne ON tut die Steuerung nichts
Switch Schalte_ISCHLSTROM_Empfehlung_einaus "Batteriemanagement aktivieren" <switch> (IBM)

// Von der ischlstrom API befuellt
Number Ischlstrom_Wolkenvorschau      "Bewoelkungsvorhersage [%.0f %%]" <sun>  (IBM)
String Ischlstrom_Wolkenvorschau_Zeit "Wolkenvorschau abgerufen [%s]"   <time> (IBM)
String Ischlstrom_Crossover_Start     "Crossover Start [%s]"            <time> (IBM)
String Ischlstrom_Crossover_Ende      "Crossover Ende [%s]"             <time> (IBM)
String Ischlstrom_Ladesperre_Start    "Ladesperre ab [%s]"              <time> (IBM)
String Ischlstrom_Ladesperre_Ende     "Ladesperre bis [%s]"             <time> (IBM)
String Ischlstrom_Ladesperre_Datum    "Ladesperre-Fenster fuer [%s]"    <calendar> (IBM)

// Vom Mitglied einstellbar
Number IBM_MIN_BATTERY_CHARGE                       "Minimaler Ladestand Batterie [%.0f %%]" <batterylevel> (IBM)
Number Minimale_Entladeleistung_Batterieeinspeisung "Minimale Entladeleistung [%.0f W]"      <energy>       (IBM)
Number Maximale_Entladeleistung_Batterieeinspeisung "Maximale Entladeleistung [%.0f W]"      <energy>       (IBM)

// Pause: solange > 0 setzt IBM aus (der Wechselrichter arbeitet wie ab
// Werk); die Regel ibm_pause.js zaehlt den Wert jede Nacht um 1 herunter
Number IBM_PAUSE_TAGE "IBM-Pause (verbleibende Tage) [%.0f]" <calendar> (IBM)

// Ladesperre am Vormittag (Fenster kommt aus der Tagesprognose der API)
Switch IBM_LADESPERRE_AKTIV            "Ladesperre bei Sonnenprognose"      <switch> (IBM)
Number IBM_LADESPERRE_WOLKEN_SCHWELLE  "Wolken-Schwelle Ladesperre [%.0f %%]" <sun>  (IBM)

// Forcierte Entladung in der Nacht (Fenster kommt aus den Crossover-Zeiten)
Switch IBM_ENTLADUNG_AKTIV             "Forcierte Entladung nachts"         <switch> (IBM)

// Dynamische Entladeleistung: die Steuerung schaetzt die Batteriekapazitaet
// aus der Ladestandsaenderung waehrend der Entladung und leitet daraus die
// Entladeleistung ab. IBM_KAPAZITAET_MESSUNG ist interner Zustand (JSON).
Switch IBM_DYNAMISCHE_LEISTUNG   "Entladeleistung an Batteriegroesse anpassen" <switch>  (IBM)
Number IBM_BATTERIE_KAPAZITAET   "Geschaetzte Batteriekapazitaet [%.1f kWh]"   <battery> (IBM)
String IBM_KAPAZITAET_MESSUNG    "Kapazitaetsschaetzung (intern) [%s]"         <settings> (IBM)
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
//
// Kein Strategies-Block: everyChange und restoreOnStartup sind eingebaut,
// und Default-Strategien versteht openHAB seit 5.1 nicht mehr.
// ============================================================================

Items {
    Schalte_ISCHLSTROM_Empfehlung_einaus,
    Ischlstrom_Wolkenvorschau,
    Ischlstrom_Wolkenvorschau_Zeit,
    Ischlstrom_Crossover_Start,
    Ischlstrom_Crossover_Ende,
    Ischlstrom_Ladesperre_Start,
    Ischlstrom_Ladesperre_Ende,
    Ischlstrom_Ladesperre_Datum,
    IBM_MIN_BATTERY_CHARGE,
    Minimale_Entladeleistung_Batterieeinspeisung,
    Maximale_Entladeleistung_Batterieeinspeisung,
    IBM_PAUSE_TAGE,
    IBM_LADESPERRE_AKTIV,
    IBM_LADESPERRE_WOLKEN_SCHWELLE,
    IBM_ENTLADUNG_AKTIV,
    IBM_DYNAMISCHE_LEISTUNG,
    IBM_BATTERIE_KAPAZITAET,
    IBM_KAPAZITAET_MESSUNG
        : strategy = everyChange, restoreOnStartup
}
EOF

  # rrd4j: Zeitreihen fuer Analyze/Diagramme in der Main UI. Nur Zahlenwerte;
  # everyMinute ist fuer rrd4j Pflicht (die Archive erwarten lueckenlose
  # Minutenwerte). Kein restoreOnStartup - das erledigt mapdb, und die
  # Batteriewerte kommen ohnehin frisch vom Binding. Ein hier gelistetes,
  # (noch) nicht vorhandenes Item ist unschaedlich - beim klassischen Weg
  # entsteht das SoC-Item erst in der Main UI.
  battery_persist="    ${SOC_ITEM},"
  if [ -n "$BATTERY_POWER_ITEM" ]; then
    battery_persist="${battery_persist}
    ${BATTERY_POWER_ITEM},"
  fi
  install_file "$OPENHAB_CONF/persistence/rrd4j.persist" <<EOF
// ============================================================================
// ISCHLSTROM Batteriemanagement (IBM)
// GENERIERT von 03-install-items.sh
//
// Zeitreihen fuer Analyze/Diagramme in der Main UI (rrd4j ist der
// Standard-Persistence-Dienst, siehe runtime.cfg). Die Einstellungen
// selbst sichert mapdb.persist.
// ============================================================================

// Default-Strategien ('default = ...') versteht openHAB seit 5.1 nicht mehr -
// jede Item-Zeile nennt ihre Strategien deshalb selbst.
Strategies {
    everyMinute : "0 * * * * ?"
}

Items {
${battery_persist}
    Ischlstrom_Wolkenvorschau,
    IBM_MIN_BATTERY_CHARGE,
    Minimale_Entladeleistung_Batterieeinspeisung,
    Maximale_Entladeleistung_Batterieeinspeisung,
    IBM_PAUSE_TAGE,
    IBM_LADESPERRE_WOLKEN_SCHWELLE,
    IBM_BATTERIE_KAPAZITAET
        : strategy = everyChange, everyMinute
}
EOF

  # rrd4j als Standard-Dienst: Analyze/Diagramme fragen ohne explizite Wahl
  # den Standard ab, und mapdb kann nicht charten (nur letzter Wert).
  # restoreOnStartup haengt nicht vom Standard ab.
  runtime_cfg_set "org.openhab.persistence:default" "rrd4j"

  # Ohne das hier bleiben frisch geschriebene .persist-Modelle wirkungslos,
  # wenn openHAB die Persistence-Addons noch installiert - siehe Helfer.
  persistence_activate mapdb rrd4j
else
  log "INSTALL_PERSISTENCE=0 - Persistence uebersprungen."
  warn "Ohne Persistence stehen die Einstellungen nach einem Neustart auf NULL."
fi

log "Items installiert."
