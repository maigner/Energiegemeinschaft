#!/usr/bin/env bash
# ============================================================================
# ISCHLSTROM Batteriemanagement (IBM) - Komplettinstallation
#
# Startet ohne bestehende Konfiguration automatisch den Assistenten (oder,
# mit Provisionierungs-Code, 00-provision.sh) und fuehrt danach die
# Einzelschritte aus. Idempotent: jederzeit wiederholbar.
#
#   sudo ./install-ibm.sh
#   sudo IBM_ASSUME_YES=1 ./install-ibm.sh    # ohne Rueckfragen (Vorgaben)
#   sudo IBM_PROVISION_CODE=XXXX-XXXX ./install-ibm.sh   # Zero-Touch
#
# Reihenfolge: zuerst alles, was keinen Wechselrichter braucht (Fernwartung,
# Passwoerter, Cloud-Identitaet, Addons) - so ist die Anlage fuer den
# Vorstand erreichbar, selbst wenn es beim Wechselrichter haengt. Bei der
# Provisionierung meldet jeder Schritt seine Phase an ischlstrom.org.
#
# Exit-Code 75 (EX_TEMPFAIL) heisst "unvollstaendig, spaeter erneut":
# ibm-firstboot wiederholt den Lauf dann automatisch.
# ============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/lib/common.sh"

require_root
require_openhab

EX_TEMPFAIL=75
incomplete=0
incomplete_list=""

# Bei der Provisionierung gibt es niemanden, der Rueckfragen beantwortet.
if [ -n "${IBM_PROVISION_CODE:-}" ] || [ -f /boot/firmware/ibm-provision.conf ] || [ -f /boot/ibm-provision.conf ]; then
  export IBM_ASSUME_YES=1
fi

# Schritt mit Phasenmeldung: step <phase> <skript> [optional]
#   optional=1: Fehler nur warnen (Lauf geht weiter, Phase fehler:<phase>)
step() {
  local phase="$1" script="$2" optional="${3:-0}" rc=0
  report_phase "$phase"
  "$here/$script" || rc=$?
  if [ "$rc" -eq "$EX_TEMPFAIL" ]; then
    incomplete=1
    incomplete_list="${incomplete_list:+$incomplete_list, }$phase"
    warn "$script: noch nicht abgeschlossen - wird spaeter wiederholt."
  elif [ "$rc" -ne 0 ]; then
    if [ "$optional" = "1" ]; then
      warn "$script fehlgeschlagen (Exit $rc) - spaeter erneut: sudo $here/$script"
      report_phase "fehler:$phase" "$script fehlgeschlagen (Exit $rc), Installation laeuft weiter."
    else
      report_phase "fehler:$phase" "$script fehlgeschlagen (Exit $rc)."
      die "$script fehlgeschlagen (Exit $rc)."
    fi
  fi
}

log "=== Schritt 1/14: Konfiguration ==="
if [ -f "$IBM_CONF" ]; then
  log "Konfiguration vorhanden: $IBM_CONF"
  log "Neu erfassen mit: sudo $here/00-wizard.sh"
elif [ -n "${IBM_PROVISION_CODE:-}" ] || [ -f /boot/firmware/ibm-provision.conf ] || [ -f /boot/ibm-provision.conf ]; then
  rc=0; "$here/00-provision.sh" || rc=$?
  [ "$rc" -eq 0 ] || exit "$rc"
else
  "$here/00-wizard.sh"
fi

load_config

# Linux-Passwort der Provisionierung (nur fuer diesen Lauf, siehe 00-provision.sh)
if [ -f "${IBM_RUN_DIR:-/run}/ibm-provision.env" ]; then
  # shellcheck disable=SC1091
  . "${IBM_RUN_DIR:-/run}/ibm-provision.env"
  export IBM_NEW_PASSWORD
fi

log "=== Schritt 2/14: Zeitzone und Regionaleinstellungen ==="
ensure_regional_settings

log "=== Schritt 3/14: WireGuard-Fernwartung ==="
step tunnel 08-install-wireguard.sh 1

log "=== Schritt 4/14: Standardpasswoerter ==="
step passwoerter 10-change-passwords.sh 1

log "=== Schritt 5/14: openHAB Cloud (Identitaet) ==="
if [ -n "$CLOUD_UUID" ]; then
  # Provisioniert: UUID und Secret vom Server schreiben (vor dem Cloud-Addon).
  step cloud 07-myopenhab.sh 1
else
  log "Keine Cloud-Identitaet vom Server - Registrierung am Ende (Schritt 13)."
fi

log "=== Schritt 6/14: Addons ==="
step addons 02-install-addons.sh

log "=== Schritt 7/14: Preflight ==="
if ! "$here/01-preflight.sh"; then
  warn "Preflight meldet Probleme."
  confirm "Trotzdem fortfahren?" || die "Abgebrochen."
fi

log "=== Schritt 8/14: Wechselrichter-Thing ==="
step wechselrichter 02b-install-things.sh 1

log "=== Schritt 9/14: Items und Persistence ==="
step items 03-install-items.sh

log "=== Schritt 10/14: Regeln ==="
step regeln 04-install-rules.sh

log "=== Schritt 11/14: Overview-Seite ==="
step overview 05-install-overview.sh 1

log "=== Schritt 12/14: Selbst-Update ==="
step updater 09-install-updater.sh 1

log "=== Schritt 13/14: Verify ==="
"$here/06-verify.sh" || warn "Verify meldet Probleme - siehe oben."

log "=== Schritt 14/14: openHAB Cloud (Registrierung) ==="
if [ "$IBM_PROVISIONED" != "1" ]; then
  "$here/07-myopenhab.sh" \
    || warn "openHAB Cloud noch nicht abgeschlossen - spaeter erneut: sudo $here/07-myopenhab.sh"
fi

rm -f "${IBM_RUN_DIR:-/run}/ibm-provision.env"

if [ "$incomplete" = "1" ]; then
  # Sammelphase fuer Dashboard und Mitgliederbereich: die spaeteren Schritte
  # haben ihre Phasen schon gemeldet, deshalb hier den Wartezustand samt der
  # offenen Schritte nachtragen (ibm-firstboot wiederholt den Lauf).
  report_phase unvollstaendig "Wartet auf: ${incomplete_list}. Der Lauf wird automatisch wiederholt."
  cat <<ENDE
[IBM]
[IBM] ===========================================================
[IBM]  Installation noch nicht vollstaendig.
[IBM] ===========================================================
[IBM]
[IBM] Ein Schritt wartet noch (z. B. auf das Wechselrichter-Passwort vom
[IBM] Mitgliederbereich). Der Lauf wird automatisch wiederholt
[IBM] (ibm-firstboot) bzw. von Hand: sudo $here/install-ibm.sh
[IBM]
ENDE
  exit "$EX_TEMPFAIL"
fi

report_phase fertig "Installation abgeschlossen."

cat <<ENDE
[IBM]
[IBM] ===========================================================
[IBM]  Installation abgeschlossen.
[IBM] ===========================================================
[IBM]
[IBM] Wechselrichter: ${INVERTER_LABEL}
[IBM] Thing-UID:      ${INVERTER_THING_UID}
[IBM]
ENDE

if [ "$IBM_PROVISIONED" = "1" ]; then
  cat <<ENDE
[IBM] Alles wurde automatisch eingerichtet (Thing, Zugangsdaten, Items,
[IBM] Admin-Konto, Cloud-Verbindung, Fernwartung). Der Hauptschalter steht
[IBM] auf ${DEFAULT_MAIN_SWITCH}. Zugangsdaten: ischlstrom.org/board/openhab.
[IBM]
ENDE
  exit 0
fi

cat <<ENDE
[IBM] Naechste Schritte in der Main UI (http://<pi>:8080):
ENDE

if [ "$AUTO_CREATE_THING" = "1" ]; then
  log "  (Thing, Zugangsdaten und Batterie-Items wurden automatisch angelegt.)"
fi

cat <<ENDE
[IBM]   1. Settings -> Add-ons pruefen (${INVERTER_BINDINGS// /, }, JS Scripting, mapdb, rrd4j)
[IBM]   2. ${INVERTER_NOTES}
[IBM]   3. Settings -> Rules: die Regeln mit dem Tag "IBM" pruefen und
[IBM]      zum Testen einmal manuell ausfuehren.
[IBM]   4. Schalter "Batteriemanagement aktivieren" einschalten.
ENDE

if [ "$INSTALL_CLOUD" = "1" ]; then
  log "  5. Konto auf https://hac.ischlstrom.org anlegen - UUID und Secret stehen"
  log "     oben (erneut anzeigen: sudo $here/07-myopenhab.sh)."
fi

cat <<ENDE
[IBM]
[IBM] Logs beobachten:
[IBM]   tail -f ${OPENHAB_LOGDIR}/openhab.log | grep '\[IBM\]'
[IBM]
ENDE
