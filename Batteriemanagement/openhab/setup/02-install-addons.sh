#!/usr/bin/env bash
# ============================================================================
# 02 - Addons: Wechselrichter-Binding, JS Scripting, mapdb und - falls
# gewuenscht - der openHAB Cloud Connector, alles ueber addons.cfg.
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

cfg="$OPENHAB_CONF/services/addons.cfg"

# Haengt einen Wert an eine kommaseparierte Liste an, ohne Duplikate.
ensure_addon() {
  local key="$1" value="$2"
  local current merged

  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$cfg"; then
    current="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$cfg" | head -n1 | cut -d= -f2- | tr -d '[:space:]')"
    case ",${current}," in
      *",${value},"*)
        log "${key}: '${value}' bereits eingetragen."
        return 0
        ;;
    esac
    merged="${current:+${current},}${value}"
    sed -i -E "s|^[[:space:]]*${key}[[:space:]]*=.*|${key} = ${merged}|" "$cfg"
    log "${key}: '${value}' ergaenzt -> ${merged}"
  else
    printf '%s = %s\n' "$key" "$value" >> "$cfg"
    log "${key}: '${value}' neu eingetragen."
  fi
}

mkdir -p "$(dirname "$cfg")"
if [ ! -f "$cfg" ]; then
  log "addons.cfg existiert nicht und wird angelegt: $cfg"
  : > "$cfg"
  chown "$OPENHAB_USER:$OPENHAB_GROUP" "$cfg" 2>/dev/null || true
else
  cp -a "$cfg" "$cfg.bak-$(date +%Y%m%d%H%M%S)"
  log "Backup angelegt: $cfg.bak-*"
fi

cat <<HINWEIS
[IBM]
[IBM] Es werden folgende Addons in addons.cfg eingetragen:
[IBM]   binding     = ${INVERTER_BINDING}
[IBM]   automation  = jsscripting      (JS-Regeln, zwingend erforderlich)
[IBM]   persistence = mapdb            (Einstellungen ueberleben Neustart)
HINWEIS
if [ "$INSTALL_CLOUD" = "1" ]; then
  echo "[IBM]   misc        = openhabcloud    (Fernzugriff ueber myopenhab.org)"
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

ensure_addon "binding" "$INVERTER_BINDING"
ensure_addon "automation" "jsscripting"
if [ "$INSTALL_PERSISTENCE" = "1" ]; then
  ensure_addon "persistence" "mapdb"
fi
if [ "$INSTALL_CLOUD" = "1" ]; then
  ensure_addon "misc" "openhabcloud"
fi

chown "$OPENHAB_USER:$OPENHAB_GROUP" "$cfg" 2>/dev/null || true
log "addons.cfg aktualisiert. Die Installation kann einige Minuten dauern."
log "Fortschritt: tail -f $OPENHAB_LOGDIR/openhab.log"
