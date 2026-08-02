#!/usr/bin/env bash
# ============================================================================
# 00 - Assistent: fragt die anlagenspezifischen Werte ab und schreibt ibm.conf.
#
# Erkennt Wechselrichter und Ladestands-Item nach Moeglichkeit selbst und
# bietet sie als Vorgabe an - Enter genuegt dann.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab

cat <<'KOPF'
[IBM]
[IBM] ===========================================================
[IBM]  ISCHLSTROM Batteriemanagement - Einrichtungsassistent
[IBM] ===========================================================
[IBM]
KOPF

if [ -f "$IBM_CONF" ]; then
  log "Es existiert bereits eine Konfiguration: $IBM_CONF"
  if ! confirm "Neu erstellen und die bestehende ueberschreiben?"; then
    log "Bestehende Konfiguration wird beibehalten."
    exit 0
  fi
fi

# --- 1. Wechselrichter ------------------------------------------------------
mapfile -t inverters < <(list_inverters)
[ "${#inverters[@]}" -gt 0 ] || die "Keine Wechselrichter-Profile in $IBM_INVERTER_DIR gefunden."

if [ "${#inverters[@]}" -eq 1 ]; then
  inverter_type="${inverters[0]}"
  log "Einziges verfuegbares Wechselrichter-Profil: $inverter_type"
else
  echo "[IBM] Verfuegbare Wechselrichter:"
  i=1
  for inv in "${inverters[@]}"; do
    label="$(. "$IBM_INVERTER_DIR/$inv/profile.sh" >/dev/null 2>&1; echo "${INVERTER_LABEL:-$inv}")"
    printf '[IBM]   %d) %s\n' "$i" "$label"
    i=$((i + 1))
  done
  ask choice "Auswahl" "1"
  case "$choice" in
    ''|*[!0-9]*) die "Ungueltige Auswahl: $choice" ;;
  esac
  [ "$choice" -ge 1 ] && [ "$choice" -le "${#inverters[@]}" ] || die "Ungueltige Auswahl: $choice"
  inverter_type="${inverters[$((choice - 1))]}"
fi

load_profile "$inverter_type"
[ -n "$INVERTER_NOTES" ] && { echo "[IBM]"; echo "[IBM] Hinweis: $INVERTER_NOTES"; echo "[IBM]"; }

# --- 2. Thing-UID -----------------------------------------------------------
mapfile -t thing_candidates < <(detect_thing_uids)

# --- 2a. Automatisches Anlegen ------------------------------------------------
# Gibt es noch kein Thing, kann das Setup den Wechselrichter selbst anlegen:
# Adresse im Netz suchen, Bridge- und Wechselrichter-Thing per REST anlegen
# (02b-install-things.sh) und die Batterie-Items in ibm.items verknuepfen
# (03-install-items.sh) - die Main UI wird dafuer nicht gebraucht.
AUTO_CREATE_THING=0
INVERTER_HOST=""
INVERTER_USERNAME=""
INVERTER_PASSWORD=""

if [ "${#thing_candidates[@]}" -eq 0 ] && [ -n "$INVERTER_HOST_THING_PREFIX" ]; then
  echo "[IBM]"
  echo "[IBM] Kein Wechselrichter-Thing gefunden. Das Setup kann den"
  echo "[IBM] Wechselrichter komplett selbst anlegen: es sucht ihn im lokalen"
  echo "[IBM] Netz, legt Bridge- und Wechselrichter-Thing in openHAB an und"
  echo "[IBM] verknuepft die Batterie-Items - ohne einen Schritt in der Main UI."
  if confirm "Wechselrichter automatisch anlegen (empfohlen)?"; then
    AUTO_CREATE_THING=1

    if type inverter_scan_hosts >/dev/null 2>&1; then
      log "Suche ${INVERTER_LABEL} im lokalen Netz (dauert einen Moment) ..."
      mapfile -t scan_hosts < <(inverter_scan_hosts 2>/dev/null || true)
    else
      scan_hosts=()
    fi
    host_scan_default="${scan_hosts[0]:-}"
    if [ "${#scan_hosts[@]}" -gt 1 ]; then
      echo "[IBM] Mehrere Geraete gefunden:"
      printf '[IBM]   %s\n' "${scan_hosts[@]}"
    elif [ "${#scan_hosts[@]}" -eq 1 ]; then
      log "Wechselrichter gefunden: $host_scan_default"
    else
      warn "Kein Geraet im Netz gefunden - Adresse bitte von Hand angeben."
    fi
    ask INVERTER_HOST "IP-Adresse/Hostname des Wechselrichters" "$host_scan_default"
    [ -n "$INVERTER_HOST" ] || die "Ohne Adresse kann das Thing nicht angelegt werden."

    if [ -n "$INVERTER_USER_PARAM" ]; then
      echo "[IBM] Fuer die Batteriesteuerung braucht das Binding die Zugangsdaten"
      echo "[IBM] des Wechselrichters (Anmeldung an dessen Weboberflaeche)."
      ask INVERTER_USERNAME "Benutzername am Wechselrichter" "$INVERTER_DEFAULT_USERNAME"
      ask_secret INVERTER_PASSWORD "Passwort am Wechselrichter (leer = spaeter im Bridge-Thing nachtragen)"
      [ -n "$INVERTER_PASSWORD" ] \
        || warn "Ohne Passwort stellt das Binding keine Batterie-Actions bereit."
    fi

    INVERTER_THING_UID="${INVERTER_THING_PREFIX}:ibm:inverter1"
    SOC_ITEM="$INVERTER_SOC_PLACEHOLDER"
    BATTERY_POWER_ITEM="$INVERTER_BATTERY_POWER_PLACEHOLDER"
    log "Thing-UID: $INVERTER_THING_UID"
    log "Ladestands-Item: $SOC_ITEM"
  fi
fi

# Ohne automatisches Anlegen: bestehendes Thing und Items suchen bzw. den
# klassischen Weg ueber die Main UI anbieten (Abschnitte 2, 3 und 3b).
if [ "$AUTO_CREATE_THING" != "1" ]; then

if [ "${#thing_candidates[@]}" -eq 1 ]; then
  thing_default="${thing_candidates[0]}"
  log "Wechselrichter erkannt: $thing_default"
elif [ "${#thing_candidates[@]}" -gt 1 ]; then
  echo "[IBM] Mehrere Wechselrichter gefunden:"
  printf '[IBM]   %s\n' "${thing_candidates[@]}"
  thing_default="${thing_candidates[0]}"
else
  thing_default=""
  warn "Kein Thing mit Praefix '${INVERTER_THING_PREFIX}' gefunden."

  if addons_cfg_has "binding" "$INVERTER_BINDING"; then
    log "Binding '${INVERTER_BINDING}' steht bereits in addons.cfg."
  elif confirm "Binding '${INVERTER_BINDING}' jetzt ueber addons.cfg installieren?"; then
    addons_cfg_prepare
    addons_cfg_add "binding" "$INVERTER_BINDING"
    wait_for_addon "openhab-binding-${INVERTER_BINDING}" || true
  fi

  if [ "${IBM_ASSUME_YES:-0}" != "1" ]; then
    log "Den Wechselrichter jetzt in der Main UI anlegen (http://<pi>:8080,"
    log "Settings -> Things -> '+'), Credentials hinterlegen und den"
    log "Ladestands-Channel mit einem Item verknuepfen."
    while confirm "Erneut nach dem Thing suchen?"; do
      mapfile -t thing_candidates < <(detect_thing_uids)
      if [ "${#thing_candidates[@]}" -ge 1 ]; then
        thing_default="${thing_candidates[0]}"
        if [ "${#thing_candidates[@]}" -gt 1 ]; then
          echo "[IBM] Mehrere Wechselrichter gefunden:"
          printf '[IBM]   %s\n' "${thing_candidates[@]}"
        fi
        log "Wechselrichter erkannt: $thing_default"
        break
      fi
      warn "Noch kein Thing mit Praefix '${INVERTER_THING_PREFIX}' gefunden."
    done
  fi
fi

ask INVERTER_THING_UID "Thing-UID des Wechselrichters" "$thing_default"
[ -n "$INVERTER_THING_UID" ] || die "Ohne Thing-UID kann nicht eingerichtet werden."

# --- 3. SoC-Item ------------------------------------------------------------
mapfile -t soc_candidates < <(detect_soc_items "$INVERTER_THING_UID")

if [ "${#soc_candidates[@]}" -eq 1 ]; then
  soc_default="${soc_candidates[0]}"
  log "Ladestands-Item erkannt: $soc_default"
elif [ "${#soc_candidates[@]}" -gt 1 ]; then
  echo "[IBM] Moegliche Ladestands-Items:"
  printf '[IBM]   %s\n' "${soc_candidates[@]}"
  soc_default="${soc_candidates[0]}"
else
  soc_default=""
  warn "Kein Ladestands-Item gefunden."
  if [ "${IBM_ASSUME_YES:-0}" != "1" ]; then
    log "Den Channel '${INVERTER_SOC_CHANNEL}' des Things jetzt in der Main UI mit"
    log "einem Item verknuepfen (Settings -> Things -> Wechselrichter -> Channels"
    log "-> 'Add Link to Item') - danach hier fortfahren."
    while confirm "Erneut nach dem Ladestands-Item suchen?"; do
      mapfile -t soc_candidates < <(detect_soc_items "$INVERTER_THING_UID")
      if [ "${#soc_candidates[@]}" -ge 1 ]; then
        soc_default="${soc_candidates[0]}"
        if [ "${#soc_candidates[@]}" -gt 1 ]; then
          echo "[IBM] Moegliche Ladestands-Items:"
          printf '[IBM]   %s\n' "${soc_candidates[@]}"
        fi
        log "Ladestands-Item erkannt: $soc_default"
        break
      fi
      warn "Noch kein Ladestands-Item gefunden."
    done
  fi
fi

ask SOC_ITEM "Item mit dem Batterie-Ladestand" "$soc_default"
[ -n "$SOC_ITEM" ] || die "Ohne Ladestands-Item kann nicht eingerichtet werden."

# --- 3b. Batterieleistungs-Item (fuer die Overview-Seite) --------------------
# Optional: Die Overview zeigt damit die aktuelle Einspeiseleistung der
# Batterie. Ohne verknuepftes Item bleibt die Karte leer ("-").
BATTERY_POWER_ITEM=""
if [ -n "$INVERTER_BATTERY_POWER_PLACEHOLDER" ]; then
  mapfile -t power_candidates < <(detect_battery_power_items "$INVERTER_THING_UID")

  if [ "${#power_candidates[@]}" -ge 1 ]; then
    power_default="${power_candidates[0]}"
    if [ "${#power_candidates[@]}" -gt 1 ]; then
      echo "[IBM] Moegliche Batterieleistungs-Items:"
      printf '[IBM]   %s\n' "${power_candidates[@]}"
    fi
    log "Batterieleistungs-Item erkannt: $power_default"
  else
    power_default="$INVERTER_BATTERY_POWER_PLACEHOLDER"
    warn "Kein Batterieleistungs-Item gefunden. Den Channel"
    warn "'${INVERTER_BATTERY_POWER_CHANNEL}' des Things in der Main UI mit einem"
    warn "Item verknuepfen (Standardname unten), sonst bleibt die Karte"
    warn "'Einspeiseleistung der Batterie' auf der Overview leer."
  fi

  ask BATTERY_POWER_ITEM "Item mit der Batterieleistung" "$power_default"
fi

fi # Ende des manuellen Wegs (AUTO_CREATE_THING != 1)

# --- 4. API -----------------------------------------------------------------
ask IBM_API_BASE "Basis-URL der ischlstrom API" "https://ischlstrom.org"

# --- 4b. Status-Push (Vorstands-Dashboard) ----------------------------------
INSTALL_STATUS_PUSH=0
IBM_ANLAGE_NAME=""
IBM_STATUS_TOKEN=""

echo "[IBM]"
echo "[IBM] Die Anlage kann alle 5 Minuten ihren Zustand (Ladestand, Status des"
echo "[IBM] Wechselrichters, Einstellungen) an ischlstrom.org melden. Der"
echo "[IBM] Vorstand sieht alle Anlagen dann auf einem Dashboard und erkennt"
echo "[IBM] Ausfaelle frueh. Es werden nur die IBM-Betriebsdaten uebertragen."
echo "[IBM] Dafuer wird das Status-Token dieser Anlage benoetigt - der Vorstand"
echo "[IBM] erzeugt es auf ischlstrom.org unter /board/openhab (je Mitglied)."
if confirm "Anlagenstatus an ischlstrom.org melden?"; then
  ask IBM_STATUS_TOKEN "Status-Token dieser Anlage (leer = Status-Push ueberspringen)" ""
  if [ -n "$IBM_STATUS_TOKEN" ]; then
    ask IBM_ANLAGE_NAME "Name der Anlage (erscheint am Dashboard)" "$(hostname)"
    INSTALL_STATUS_PUSH=1
  else
    warn "Kein Token - Status-Push wird uebersprungen. Spaeter nachruestbar:"
    warn "INSTALL_STATUS_PUSH=1 und IBM_STATUS_TOKEN in ibm.conf eintragen,"
    warn "dann 04-install-rules.sh erneut ausfuehren."
  fi
fi

# --- 5. Batterieeinstellungen ----------------------------------------------
echo "[IBM]"
echo "[IBM] Startwerte - koennen spaeter jederzeit in der Main UI geaendert werden."
ask DEFAULT_MIN_BATTERY_CHARGE "Minimaler Ladestand in Prozent (darunter wird nicht entladen)" "20"
ask DEFAULT_MIN_DISCHARGE_W    "Minimale Entladeleistung in Watt" "1000"
ask DEFAULT_MAX_DISCHARGE_W    "Maximale Entladeleistung in Watt" "3000"

# --- 6. Addons --------------------------------------------------------------
echo "[IBM]"
echo "[IBM] Die Addons (${INVERTER_BINDING}, jsscripting, mapdb, rrd4j) koennen ueber addons.cfg"
echo "[IBM] installiert werden. Bei einer bereits eingerichteten Anlage kann das"
echo "[IBM] Addons entfernen, die nur ueber die Main UI installiert wurden."
if confirm "Addons ueber addons.cfg verwalten?"; then
  INSTALL_ADDONS=1
else
  INSTALL_ADDONS=0
fi

# --- 7. openHAB Cloud -------------------------------------------------------
echo "[IBM]"
echo "[IBM] Mit openHAB Cloud (myopenhab.org) ist die Anlage von unterwegs"
echo "[IBM] erreichbar und kann Benachrichtigungen aufs Handy schicken."
echo "[IBM] Dafuer wird das Addon 'openhabcloud' installiert; am Ende der"
echo "[IBM] Installation werden UUID und Secret fuer die Registrierung angezeigt."
if confirm "openHAB Cloud (myopenhab.org) einrichten?"; then
  INSTALL_CLOUD=1
else
  INSTALL_CLOUD=0
fi

if [ "$INSTALL_CLOUD" = "1" ] && [ "$INSTALL_ADDONS" != "1" ]; then
  warn "Addon-Verwaltung ist abgeschaltet - den 'openHAB Cloud Connector' dann"
  warn "bitte in der Main UI installieren: Settings -> Add-ons -> Misc."
fi

# --- 8. openHAB-API-Token ---------------------------------------------------
OH_API_TOKEN=""
if [ "$AUTO_CREATE_THING" = "1" ]; then
  # Bei der automatischen Einrichtung erzeugt das Setup das Token selbst
  # ueber die Karaf-Konsole (ensure_api_token in 02b-install-things.sh).
  OH_API_TOKEN="auto"
  echo "[IBM]"
  log "openHAB-API-Token wird bei der Installation automatisch erzeugt."
else
  echo "[IBM]"
  echo "[IBM] Netzwerk-Watchdog und Overview-Seite schreiben ueber die REST API."
  echo "[IBM] Dafuer wird ein openHAB-API-Token eines Admin-Benutzers benoetigt."
  echo "[IBM] 'auto' = das Setup erzeugt selbst eines (ueber die Karaf-Konsole,"
  echo "[IBM] braucht einen Admin-Benutzer in openHAB); alternativ ein Token aus"
  echo "[IBM] der Main UI eintragen (Benutzername links unten ->"
  echo "[IBM] 'Create new API token')."
  ask OH_API_TOKEN "openHAB-API-Token (leer = Watchdog und Overview ueberspringen)" "auto"
fi

# --- 9. Netzwerk-Watchdog ---------------------------------------------------
INSTALL_WATCHDOG=0
INVERTER_HOST_THING_UID=""

if [ -z "$OH_API_TOKEN" ]; then
  warn "Kein API-Token - Watchdog und Overview-Seite werden uebersprungen."
  warn "Spaeter nachruestbar: OH_API_TOKEN in ibm.conf eintragen und die"
  warn "betreffenden Schritte erneut ausfuehren (siehe README)."
elif [ -n "$INVERTER_REDISCOVER_SCRIPT" ] && [ -n "$INVERTER_HOST_THING_PREFIX" ] \
   && [ -f "$IBM_SCRIPT_DIR/$INVERTER_REDISCOVER_SCRIPT" ]; then
  echo "[IBM]"
  echo "[IBM] Teilt der Router dem Wechselrichter per DHCP eine neue IP zu, verliert"
  echo "[IBM] openHAB die Verbindung. Der Netzwerk-Watchdog sucht in dem Fall das"
  echo "[IBM] lokale Netz ab und traegt die neue Adresse selbst in das Thing ein."
  if confirm "Netzwerk-Watchdog einrichten?"; then
    if [ "$AUTO_CREATE_THING" = "1" ]; then
      # Die Bridge legt 02b-install-things.sh unter dieser UID an.
      INVERTER_HOST_THING_UID="${INVERTER_HOST_THING_PREFIX}:ibm"
      INSTALL_WATCHDOG=1
      log "Bridge-Thing: $INVERTER_HOST_THING_UID"
    else
    mapfile -t host_candidates < <(detect_thing_uids "$INVERTER_HOST_THING_PREFIX")

    # Rueckfalloption: Bridge-Segment aus der Wechselrichter-UID ableiten
    # (fronius:powerinverter:<bridge>:<id> -> fronius:bridge:<bridge>).
    host_default=""
    if [ "$(echo "$INVERTER_THING_UID" | awk -F: '{print NF}')" -eq 4 ]; then
      host_default="${INVERTER_HOST_THING_PREFIX}:$(echo "$INVERTER_THING_UID" | cut -d: -f3)"
    fi

    if [ "${#host_candidates[@]}" -eq 1 ]; then
      host_default="${host_candidates[0]}"
      log "Bridge erkannt: $host_default"
    elif [ "${#host_candidates[@]}" -gt 1 ]; then
      echo "[IBM] Mehrere Bridges gefunden:"
      printf '[IBM]   %s\n' "${host_candidates[@]}"
      host_default="${host_candidates[0]}"
    elif [ -z "$host_default" ]; then
      warn "Kein Thing mit Praefix '${INVERTER_HOST_THING_PREFIX}' gefunden."
    fi

    ask INVERTER_HOST_THING_UID "Thing-UID der Bridge (traegt die IP-Adresse)" "$host_default"

    if [ -n "$INVERTER_HOST_THING_UID" ]; then
      INSTALL_WATCHDOG=1
    else
      warn "Ohne Bridge-UID kein Watchdog - spaeter nachruestbar:"
      warn "Werte in ibm.conf eintragen (INVERTER_HOST_THING_UID,"
      warn "INSTALL_WATCHDOG=1) und 04-install-rules.sh erneut ausfuehren."
    fi
    fi # Ende der manuellen Bridge-Erkennung (AUTO_CREATE_THING != 1)
  fi
fi

# --- 10. Overview-Seite -----------------------------------------------------
INSTALL_OVERVIEW=0
if [ -n "$OH_API_TOKEN" ] && [ -f "$IBM_INVERTER_DIR/$INVERTER_TYPE/overview.yaml" ]; then
  echo "[IBM]"
  echo "[IBM] Die IBM-Uebersichtsseite zeigt und bedient alle Einstellungen des"
  echo "[IBM] Batteriemanagements auf der Startseite der Main UI. Sie ersetzt die"
  echo "[IBM] Seite 'Overview'; eine bestehende Seite wird vorher gesichert."
  if confirm "Overview-Seite der Main UI installieren?"; then
    INSTALL_OVERVIEW=1
  fi
fi

# --- 11. Fernwartung (WireGuard) --------------------------------------------
INSTALL_WIREGUARD=0
WG_ADDRESS=""
WG_SERVER_ENDPOINT="s1.ischlstrom.org:51820"

echo "[IBM]"
echo "[IBM] Ueber einen WireGuard-Tunnel zum Wartungsserver kann ISCHLSTROM die"
echo "[IBM] Anlage aus der Ferne warten (Updates, Fehlersuche). Der Pi baut die"
echo "[IBM] Verbindung selbst nach aussen auf - am Router ist nichts zu tun,"
echo "[IBM] und der normale Internetverkehr bleibt unberuehrt."
if confirm "WireGuard-Fernwartung einrichten?"; then
  # Kein Vorgabewert: die Tunnel-IP vergibt der Wartungsserver, und zwei
  # Anlagen mit derselben IP wuerden sich stumm gegenseitig verdraengen.
  # Leere Eingabe heisst ueberspringen - aber nur nach Rueckfrage, damit
  # ein versehentliches Enter die Fernwartung nicht still abwaehlt.
  while :; do
    ask WG_ADDRESS "Tunnel-IP dieser Anlage (vergibt der Wartungsserver, z. B. 10.88.0.11; leer = ueberspringen)" ""
    [ -n "$WG_ADDRESS" ] && break
    confirm "Wirklich ohne Fernwartung fortfahren?" && break
  done
  if [ -n "$WG_ADDRESS" ]; then
    ask WG_SERVER_ENDPOINT "Wartungsserver (Host:Port)" "$WG_SERVER_ENDPOINT"
    INSTALL_WIREGUARD=1
  else
    warn "Ohne Tunnel-IP keine Fernwartung - spaeter nachruestbar:"
    warn "INSTALL_WIREGUARD=1 und WG_ADDRESS in ibm.conf eintragen, dann"
    warn "08-install-wireguard.sh erneut ausfuehren."
  fi
fi

# --- 12. Standardpasswoerter --------------------------------------------------
INSTALL_PASSWORD_CHANGE=0

echo "[IBM]"
echo "[IBM] openHABian kommt mit allgemein bekannten Standardpasswoertern -"
echo "[IBM] und die SSH-Anmeldung (auch die Fernwartung durch den Tunnel)"
echo "[IBM] laeuft per Passwort. Sie gelten auch fuer die Konsole"
echo "[IBM] (Tastatur/Monitor), fuer Samba und fuer die Karaf-Konsole von"
echo "[IBM] openHAB. Das Setup kann sie aendern: das"
echo "[IBM] Passwort des Linux-Benutzers wird bei der Installation abgefragt,"
echo "[IBM] das der Karaf-Konsole zufaellig erzeugt und einmalig angezeigt."
echo "[IBM] Geaendert wird nur, was noch auf dem Standardwert steht."
if confirm "Standardpasswoerter aendern (Linux-Benutzer und Karaf-Konsole)?"; then
  INSTALL_PASSWORD_CHANGE=1
fi

# --- 13. Schreiben ----------------------------------------------------------
# Zugangsdaten fuer die Bash-Doppelquotes in ibm.conf entschaerfen
esc() { printf '%s' "$1" | sed -e 's/[\\"$`]/\\&/g'; }
INVERTER_USERNAME_ESC="$(esc "$INVERTER_USERNAME")"
INVERTER_PASSWORD_ESC="$(esc "$INVERTER_PASSWORD")"

umask 077
cat > "$IBM_CONF" <<EOF
# ============================================================================
# Konfiguration fuer das ISCHLSTROM Batteriemanagement (IBM)
# Erzeugt von 00-wizard.sh am $(date '+%Y-%m-%d %H:%M:%S')
# ============================================================================

# --- Anlage -----------------------------------------------------------------
INVERTER_TYPE="${INVERTER_TYPE}"
INVERTER_THING_UID="${INVERTER_THING_UID}"
SOC_ITEM="${SOC_ITEM}"
BATTERY_POWER_ITEM="${BATTERY_POWER_ITEM}"

# --- Automatische Einrichtung -------------------------------------------------
# 02b-install-things.sh legt Bridge- und Wechselrichter-Thing selbst an
# (Adresse und Zugangsdaten unten), 03-install-items.sh verknuepft die
# Batterie-Items direkt in ibm.items. Wegen INVERTER_PASSWORD ist diese
# Datei nur fuer root lesbar.
AUTO_CREATE_THING=${AUTO_CREATE_THING}
INVERTER_HOST="${INVERTER_HOST}"
INVERTER_USERNAME="${INVERTER_USERNAME_ESC}"
INVERTER_PASSWORD="${INVERTER_PASSWORD_ESC}"

# --- ischlstrom API ---------------------------------------------------------
IBM_API_BASE="${IBM_API_BASE}"

# --- Zeitplaene (Quartz-Cron: sek min std tag monat wochentag) ---------------
CRON_BATTERY="0 */5 * * * ?"
CRON_CLOUD="0 40 * * * ?"
CRON_CROSSOVER="0 5 4 * * ?"
CRON_LADESPERRE="0 50 * * * ?"
CRON_INIT="0 */10 * * * ?"
CRON_PAUSE="0 30 0 * * ?"
CRON_STATUS="0 2/5 * * * ?"

# --- Startwerte -------------------------------------------------------------
DEFAULT_MIN_BATTERY_CHARGE=${DEFAULT_MIN_BATTERY_CHARGE}
DEFAULT_MIN_DISCHARGE_W=${DEFAULT_MIN_DISCHARGE_W}
DEFAULT_MAX_DISCHARGE_W=${DEFAULT_MAX_DISCHARGE_W}

# Zeitfenster und Schwellwerte der Steuerung. Nicht im Assistenten abgefragt -
# hier oder spaeter direkt in der Main UI anpassen.
DEFAULT_LADESPERRE_AKTIV=ON
DEFAULT_WOLKEN_SCHWELLE=75
DEFAULT_ENTLADUNG_AKTIV=ON

# Entladeleistung automatisch an die geschaetzte Batteriegroesse anpassen;
# die MIN/MAX-Werte oben bleiben der Rueckfall ohne belastbare Schaetzung.
DEFAULT_DYNAMISCHE_LEISTUNG=ON

# --- Status-Push ------------------------------------------------------------
# Meldet den Anlagenzustand alle 5 Minuten an <IBM_API_BASE>/api/ibm/status/v1
# (Vorstands-Dashboard unter /board/openhab). Das Token erzeugt der Vorstand
# dort je Mitglied; ohne gueltiges Token weist der Server die Meldung ab.
INSTALL_STATUS_PUSH=${INSTALL_STATUS_PUSH}
IBM_ANLAGE_NAME="${IBM_ANLAGE_NAME}"
IBM_STATUS_TOKEN="${IBM_STATUS_TOKEN}"

# --- Optionen ---------------------------------------------------------------
INSTALL_ADDONS=${INSTALL_ADDONS}
INSTALL_PERSISTENCE=1
INSTALL_CLOUD=${INSTALL_CLOUD}
INSTALL_OVERVIEW=${INSTALL_OVERVIEW}

# --- openHAB REST API -------------------------------------------------------
# API-Token eines Admin-Benutzers; gebraucht vom Netzwerk-Watchdog und von
# der Installation der Overview-Seite.
OH_API_TOKEN="${OH_API_TOKEN}"

# --- Netzwerk-Watchdog ------------------------------------------------------
# Sucht den Wechselrichter nach einem DHCP-IP-Wechsel im Netz und traegt die
# neue Adresse in das Bridge-Thing ein. Braucht das openHAB-API-Token.
INSTALL_WATCHDOG=${INSTALL_WATCHDOG}
INVERTER_HOST_THING_UID="${INVERTER_HOST_THING_UID}"
CRON_WATCHDOG="0 7/15 * * * ?"
WATCHDOG_COOLDOWN_MIN=10

# --- WireGuard-Fernwartung --------------------------------------------------
# Ausgehender Tunnel zum Wartungsserver fuer Updates und Fehlersuche.
# Den Server-Public-Key laedt 08-install-wireguard.sh von <IBM_API_BASE>/ibm/;
# die SSH-Anmeldung durch den Tunnel laeuft per Passwort (siehe README).
INSTALL_WIREGUARD=${INSTALL_WIREGUARD}
WG_ADDRESS="${WG_ADDRESS}"
WG_SERVER_ENDPOINT="${WG_SERVER_ENDPOINT}"

# --- Standardpasswoerter ------------------------------------------------------
# 10-change-passwords.sh aendert die Standardpasswoerter des Linux-Benutzers
# 'openhabian' (wird bei der Installation abgefragt bzw. IBM_NEW_PASSWORD;
# Samba wird mitgeaendert) und der Karaf-Konsole (wird zufaellig erzeugt und
# einmalig angezeigt). Passwoerter selbst stehen nie in dieser Datei.
INSTALL_PASSWORD_CHANGE=${INSTALL_PASSWORD_CHANGE}
EOF

chmod 600 "$IBM_CONF"
log "Konfiguration geschrieben: $IBM_CONF"
cat <<ZUSAMMENFASSUNG
[IBM]
[IBM] Zusammenfassung
[IBM]   Wechselrichter : ${INVERTER_LABEL}
[IBM]   Thing-UID      : ${INVERTER_THING_UID}
[IBM]   Anlegen        : $([ "$AUTO_CREATE_THING" = "1" ] && echo "automatisch (${INVERTER_HOST})" || echo "vorhandenes Thing wird verwendet")
[IBM]   Ladestand-Item : ${SOC_ITEM}
[IBM]   Leistungs-Item : ${BATTERY_POWER_ITEM:-"(keins - Karte bleibt leer)"}
[IBM]   API            : ${IBM_API_BASE}
[IBM]   Status-Push    : $([ "$INSTALL_STATUS_PUSH" = "1" ] && echo "ja (${IBM_ANLAGE_NAME})" || echo "nein")
[IBM]   Ladestand min. : ${DEFAULT_MIN_BATTERY_CHARGE} %
[IBM]   Entladung      : ${DEFAULT_MIN_DISCHARGE_W} - ${DEFAULT_MAX_DISCHARGE_W} W
[IBM]   Addons         : $([ "$INSTALL_ADDONS" = "1" ] && echo "ueber addons.cfg" || echo "manuell in der Main UI")
[IBM]   openHAB Cloud  : $([ "$INSTALL_CLOUD" = "1" ] && echo "ja (myopenhab.org)" || echo "nein")
[IBM]   Watchdog       : $([ "$INSTALL_WATCHDOG" = "1" ] && echo "ja (${INVERTER_HOST_THING_UID})" || echo "nein")
[IBM]   Overview-Seite : $([ "$INSTALL_OVERVIEW" = "1" ] && echo "ja" || echo "nein")
[IBM]   Fernwartung    : $([ "$INSTALL_WIREGUARD" = "1" ] && echo "ja (${WG_ADDRESS} -> ${WG_SERVER_ENDPOINT})" || echo "nein")
[IBM]   Passwoerter    : $([ "$INSTALL_PASSWORD_CHANGE" = "1" ] && echo "Standardpasswoerter werden geaendert" || echo "unveraendert")
[IBM]
ZUSAMMENFASSUNG
