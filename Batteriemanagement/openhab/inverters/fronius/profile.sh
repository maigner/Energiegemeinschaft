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

# Steuerungsskript, relativ zu IBM_SCRIPT_DIR
INVERTER_CONTROL_SCRIPT="inverters/fronius/control.js"

# Platzhalter im Steuerungsskript, die das Setup ersetzt:
#   - die fest verdrahtete Thing-UID (ueber INVERTER_THING_PREFIX erkannt)
#   - der Itemname des Ladestands
INVERTER_SOC_PLACEHOLDER="Fronius_Symo_Inverter_Battery_State_of_Charge"

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="Im Fronius Thing muessen Benutzername und Passwort des Wechselrichters hinterlegt sein - ohne Credentials stellt das Binding die Batterie-Actions nicht bereit."
