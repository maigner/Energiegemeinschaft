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
  warn "Kein Ladestands-Item gefunden. Den Channel '${INVERTER_SOC_CHANNEL}' des"
  warn "Things in der Main UI mit einem Item verknuepfen."
fi

ask SOC_ITEM "Item mit dem Batterie-Ladestand" "$soc_default"
[ -n "$SOC_ITEM" ] || die "Ohne Ladestands-Item kann nicht eingerichtet werden."

# --- 4. API -----------------------------------------------------------------
ask IBM_API_BASE "Basis-URL der ischlstrom API" "https://ischlstrom.org"

# --- 5. Batterieeinstellungen ----------------------------------------------
echo "[IBM]"
echo "[IBM] Startwerte - koennen spaeter jederzeit in der Main UI geaendert werden."
ask DEFAULT_MIN_BATTERY_CHARGE "Minimaler Ladestand in Prozent (darunter wird nicht entladen)" "20"
ask DEFAULT_MIN_DISCHARGE_W    "Minimale Entladeleistung in Watt" "1000"
ask DEFAULT_MAX_DISCHARGE_W    "Maximale Entladeleistung in Watt" "3000"

# --- 6. Addons --------------------------------------------------------------
echo "[IBM]"
echo "[IBM] Die Addons (${INVERTER_BINDING}, jsscripting, mapdb) koennen ueber addons.cfg"
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

# --- 8. Netzwerk-Watchdog ---------------------------------------------------
INSTALL_WATCHDOG=0
INVERTER_HOST_THING_UID=""
OH_API_TOKEN=""

if [ -n "$INVERTER_REDISCOVER_SCRIPT" ] && [ -n "$INVERTER_HOST_THING_PREFIX" ] \
   && [ -f "$IBM_SCRIPT_DIR/$INVERTER_REDISCOVER_SCRIPT" ]; then
  echo "[IBM]"
  echo "[IBM] Teilt der Router dem Wechselrichter per DHCP eine neue IP zu, verliert"
  echo "[IBM] openHAB die Verbindung. Der Netzwerk-Watchdog sucht in dem Fall das"
  echo "[IBM] lokale Netz ab und traegt die neue Adresse selbst in das Thing ein."
  echo "[IBM] Dafuer wird ein openHAB-API-Token benoetigt (Main UI -> links unten auf"
  echo "[IBM] den Benutzernamen klicken -> 'Create new API token')."
  if confirm "Netzwerk-Watchdog einrichten?"; then
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
    ask OH_API_TOKEN "openHAB-API-Token (leer = Watchdog ueberspringen)" ""

    if [ -n "$INVERTER_HOST_THING_UID" ] && [ -n "$OH_API_TOKEN" ]; then
      INSTALL_WATCHDOG=1
    else
      warn "Ohne Bridge-UID und API-Token kein Watchdog - spaeter nachruestbar:"
      warn "Werte in ibm.conf eintragen (INVERTER_HOST_THING_UID, OH_API_TOKEN,"
      warn "INSTALL_WATCHDOG=1) und 04-install-rules.sh erneut ausfuehren."
    fi
  fi
fi

# --- 9. Schreiben -----------------------------------------------------------
umask 022
cat > "$IBM_CONF" <<EOF
# ============================================================================
# Konfiguration fuer das ISCHLSTROM Batteriemanagement (IBM)
# Erzeugt von 00-wizard.sh am $(date '+%Y-%m-%d %H:%M:%S')
# ============================================================================

# --- Anlage -----------------------------------------------------------------
INVERTER_TYPE="${INVERTER_TYPE}"
INVERTER_THING_UID="${INVERTER_THING_UID}"
SOC_ITEM="${SOC_ITEM}"

# --- ischlstrom API ---------------------------------------------------------
IBM_API_BASE="${IBM_API_BASE}"

# --- Zeitplaene (Quartz-Cron: sek min std tag monat wochentag) ---------------
CRON_BATTERY="0 */5 * * * ?"
CRON_CLOUD="0 40 * * * ?"
CRON_CROSSOVER="0 5 4 * * ?"
CRON_INIT="0 */10 * * * ?"

# --- Startwerte -------------------------------------------------------------
DEFAULT_MIN_BATTERY_CHARGE=${DEFAULT_MIN_BATTERY_CHARGE}
DEFAULT_MIN_DISCHARGE_W=${DEFAULT_MIN_DISCHARGE_W}
DEFAULT_MAX_DISCHARGE_W=${DEFAULT_MAX_DISCHARGE_W}

# Zeitfenster und Schwellwerte der Steuerung. Nicht im Assistenten abgefragt -
# hier oder spaeter direkt in der Main UI anpassen.
DEFAULT_LADESPERRE_AKTIV=ON
DEFAULT_LADESPERRE_START=7
DEFAULT_LADESPERRE_ENDE=11
DEFAULT_WOLKEN_SCHWELLE=75
DEFAULT_ENTLADUNG_AKTIV=ON
DEFAULT_ENTLADUNG_START=21
DEFAULT_ENTLADUNG_ENDE=7

# --- Optionen ---------------------------------------------------------------
INSTALL_ADDONS=${INSTALL_ADDONS}
INSTALL_PERSISTENCE=1
INSTALL_CLOUD=${INSTALL_CLOUD}

# --- Netzwerk-Watchdog ------------------------------------------------------
# Sucht den Wechselrichter nach einem DHCP-IP-Wechsel im Netz und traegt die
# neue Adresse in das Bridge-Thing ein. Braucht ein openHAB-API-Token.
INSTALL_WATCHDOG=${INSTALL_WATCHDOG}
INVERTER_HOST_THING_UID="${INVERTER_HOST_THING_UID}"
OH_API_TOKEN="${OH_API_TOKEN}"
CRON_WATCHDOG="0 7/15 * * * ?"
WATCHDOG_COOLDOWN_MIN=10
EOF

log "Konfiguration geschrieben: $IBM_CONF"
cat <<ZUSAMMENFASSUNG
[IBM]
[IBM] Zusammenfassung
[IBM]   Wechselrichter : ${INVERTER_LABEL}
[IBM]   Thing-UID      : ${INVERTER_THING_UID}
[IBM]   Ladestand-Item : ${SOC_ITEM}
[IBM]   API            : ${IBM_API_BASE}
[IBM]   Ladestand min. : ${DEFAULT_MIN_BATTERY_CHARGE} %
[IBM]   Entladung      : ${DEFAULT_MIN_DISCHARGE_W} - ${DEFAULT_MAX_DISCHARGE_W} W
[IBM]   Addons         : $([ "$INSTALL_ADDONS" = "1" ] && echo "ueber addons.cfg" || echo "manuell in der Main UI")
[IBM]   openHAB Cloud  : $([ "$INSTALL_CLOUD" = "1" ] && echo "ja (myopenhab.org)" || echo "nein")
[IBM]   Watchdog       : $([ "$INSTALL_WATCHDOG" = "1" ] && echo "ja (${INVERTER_HOST_THING_UID})" || echo "nein")
[IBM]
ZUSAMMENFASSUNG
