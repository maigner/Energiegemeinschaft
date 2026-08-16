#!/usr/bin/env bash
# ============================================================================
# 02 - Addons: Wechselrichter-Binding, JS Scripting, mapdb, rrd4j und -
# falls gewuenscht - der openHAB Cloud Connector, alles ueber addons.cfg.
#
# ACHTUNG: Sobald in addons.cfg eine Kategorie gesetzt ist, ist die Datei
# fuer diese Kategorie massgeblich. Addons derselben Kategorie, die ueber die
# Main UI installiert wurden und hier nicht aufgefuehrt sind, koennen von
# openHAB wieder deinstalliert werden. Das Skript ergaenzt bestehende Werte
# deshalb, statt sie zu ueberschreiben - und fragt vorher nach.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

if [ "$INSTALL_ADDONS" != "1" ]; then
  log "INSTALL_ADDONS=0 - Addon-Installation uebersprungen."
  exit 0
fi

addons_cfg_prepare

cat <<HINWEIS
[IBM]
[IBM] Es werden folgende Addons in addons.cfg eingetragen:
[IBM]   binding     = ${INVERTER_BINDINGS// /, }
[IBM]   automation  = jsscripting      (JS-Regeln, zwingend erforderlich)
[IBM]   persistence = mapdb, rrd4j     (Einstellungen ueberleben Neustart;
[IBM]                                   rrd4j liefert die Daten fuer Analyze/Diagramme)
HINWEIS
if [ "$INSTALL_CLOUD" = "1" ]; then
  echo "[IBM]   misc        = openhabcloud    (Fernzugriff ueber $IBM_CLOUD_BASE_URL)"
fi
cat <<HINWEIS
[IBM]
[IBM] WARNUNG: addons.cfg wird damit fuer diese Kategorien massgeblich.
[IBM] Addons derselben Kategorie, die nur ueber die Main UI installiert
[IBM] wurden, koennen dadurch entfernt werden. Bei einer bestehenden
[IBM] Installation vorher pruefen: Settings -> Add-ons.
[IBM]
HINWEIS

if ! confirm "addons.cfg jetzt anpassen?"; then
  log "Abgebrochen - addons.cfg unveraendert."
  exit 0
fi

for binding in $INVERTER_BINDINGS; do
  addons_cfg_add "binding" "$binding"
done
addons_cfg_add "automation" "jsscripting"
if [ "$INSTALL_PERSISTENCE" = "1" ]; then
  addons_cfg_add "persistence" "mapdb"
  addons_cfg_add "persistence" "rrd4j"
fi
if [ "$INSTALL_CLOUD" = "1" ]; then
  addons_cfg_add "misc" "openhabcloud"
  # Eigene Cloud-Instanz statt der Vorgabe myopenhab.org. Wird auch bei
  # Bestandsanlagen umgestellt - das Konto des Mitglieds muss dann auf der
  # neuen Instanz existieren (UUID/Secret dort eintragen).
  services_cfg_set "$OPENHAB_CONF/services/openhabcloud.cfg" "baseURL" "$IBM_CLOUD_BASE_URL/"
fi

chown "$OPENHAB_USER:$OPENHAB_GROUP" "$ADDONS_CFG" 2>/dev/null || true
log "addons.cfg aktualisiert. Die Installation kann einige Minuten dauern."
log "Fortschritt: tail -f $OPENHAB_LOGDIR/openhab.log"
