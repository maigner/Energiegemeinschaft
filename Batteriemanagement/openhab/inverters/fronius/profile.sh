#!/usr/bin/env bash
# ============================================================================
# Wechselrichter-Profil: Fronius
#
# Wird von den Setup-Skripten per load_profile() eingebunden. Alles, was am
# Setup herstellerabhaengig ist, steht hier - die Skripte selbst kennen keine
# Herstellernamen mehr.
# ============================================================================

# Anzeigename im Assistenten
INVERTER_LABEL="Fronius (Symo / Gen24, Hybrid mit Batterie)"

# Addon-ID fuer addons.cfg (Kategorie binding)
INVERTER_BINDING="fronius"

# Praefix der Thing-UID, an dem der Wechselrichter in der JSONDB erkannt wird
INVERTER_THING_PREFIX="fronius:powerinverter"

# Channel, der den Batterie-Ladestand liefert
INVERTER_SOC_CHANNEL="soc"

# Channel, der die aktuelle Batterieleistung liefert (+ entladen, - laden)
INVERTER_BATTERY_POWER_CHANNEL="powerflowchannelpakku"

# Steuerungsskript, relativ zu IBM_SCRIPT_DIR
INVERTER_CONTROL_SCRIPT="inverters/fronius/control.js"

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

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="Im Fronius Thing muessen Benutzername und Passwort des Wechselrichters hinterlegt sein - ohne Credentials stellt das Binding die Batterie-Actions nicht bereit."
