#!/usr/bin/env bash
# ============================================================================
# Wechselrichter-Profil: Fronius
#
# Wird von den Setup-Skripten per load_profile() eingebunden. Alles, was am
# Setup herstellerabhaengig ist, steht hier - die Skripte selbst kennen keine
# Herstellernamen mehr.
# ============================================================================

# Anzeigename im Assistenten
INVERTER_LABEL="Fronius GEN24 (Hybrid mit Batterie)"

# Addon-ID fuer addons.cfg (Kategorie binding)
INVERTER_BINDING="fronius"

# Praefix der Thing-UID, an dem der Wechselrichter in der JSONDB erkannt wird
INVERTER_THING_PREFIX="fronius:powerinverter"

# Channel, der den Batterie-Ladestand liefert ("Battery State of Charge";
# bis openHAB 4 hiess der Channel "soc")
INVERTER_SOC_CHANNEL="powerflowinvertersoc"

# Channel, der die aktuelle Batterieleistung liefert (+ entladen, - laden)
INVERTER_BATTERY_POWER_CHANNEL="powerflowchannelpakku"

# Channel, der die aktuelle Netzleistung liefert (+ Bezug, - Einspeisung).
# Zusammen mit der Batterieleistung berechnet die Regel
# ibm_netzeinspeisung.js daraus, wie viel der Entladung ins Netz geht.
INVERTER_GRID_POWER_CHANNEL="powerflowchannelpgrid"

# Wechselrichter-Adapter (Adapter-Kontrakt siehe control/core.js), relativ
# zu IBM_SCRIPT_DIR. Das Setup setzt Adapter und Kern in dieselbe Regel.
INVERTER_ADAPTER_SCRIPT="inverters/fronius/adapter.js"

# Thing, das die Netzwerkadresse traegt (bei Fronius die Bridge, nicht der
# Wechselrichter selbst) - Praefix zur Erkennung in der JSONDB
INVERTER_HOST_THING_PREFIX="fronius:bridge"

# Name des Konfigurationsparameters mit der Adresse in diesem Thing
INVERTER_HOST_PARAM="hostname"

# Netzwerksuche fuer den Watchdog (optional), relativ zu IBM_SCRIPT_DIR.
# Fehlt die Variable, bietet das Setup keinen Watchdog an.
INVERTER_REDISCOVER_SCRIPT="inverters/fronius/rediscover.sh"

# Platzhalter im Steuerungsskript, die das Setup ersetzt:
#   - die fest verdrahtete Thing-UID (ueber INVERTER_THING_PREFIX erkannt)
#   - der Itemname des Ladestands
INVERTER_SOC_PLACEHOLDER="Fronius_Symo_Inverter_Battery_State_of_Charge"

# Platzhalter fuer das Batterieleistungs-Item in den Main-UI-Seiten; wird
# durch BATTERY_POWER_ITEM aus ibm.conf ersetzt. Der Platzhalter ist
# zugleich der Standard-Itemname beim Verknuepfen des Channels.
INVERTER_BATTERY_POWER_PLACEHOLDER="Fronius_Symo_Inverter_Battery_Power"

# Standard-Itemname der Netzleistung (analog zum Batterieleistungs-Item);
# wird durch GRID_POWER_ITEM aus ibm.conf ersetzt.
INVERTER_GRID_POWER_PLACEHOLDER="Fronius_Symo_Inverter_Grid_Power"

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="Im Fronius Thing muessen Benutzername und Passwort des Wechselrichters hinterlegt sein - ohne Credentials stellt das Binding die Batterie-Actions nicht bereit. Bei der automatischen Einrichtung traegt das Setup beides selbst ein."

# --- Automatisches Anlegen der Things (02b-install-things.sh) ----------------

# Vorgabe fuer den Benutzernamen am Wechselrichter (Batteriesteuerung)
INVERTER_DEFAULT_USERNAME="customer"

# Namen der Config-Parameter fuer die Zugangsdaten im Bridge-Thing
INVERTER_USER_PARAM="username"
INVERTER_PASSWORD_PARAM="password"

# Zusaetzliche Konfiguration des Wechselrichter-Things (JSON-Objektinhalt)
INVERTER_THING_EXTRA_CONFIG='"deviceId": 1'

# Sucht Fronius-Geraete im eigenen /24-Netz (Solar-API-Endpunkt), eine IP je
# Zeile. Gleiche Erkennung wie rediscover.sh.
inverter_scan_hosts() {
  local own_cidr base
  own_cidr="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4; exit}')"
  [ -n "$own_cidr" ] || return 0
  base="${own_cidr%/*}"; base="${base%.*}"
  seq 1 254 | xargs -P 32 -I'{}' sh -c '
    if curl -sf -m 2 --connect-timeout 1 "http://$1/solar_api/GetAPIVersion.cgi" 2>/dev/null | grep -q "\"APIVersion\""; then
      echo "$1"
    fi' _ "${base}.{}"
}
