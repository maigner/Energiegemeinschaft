#!/usr/bin/env bash
# ============================================================================
# ISCHLSTROM Batteriemanagement (IBM) - Komplettinstallation
#
# Startet ohne bestehende Konfiguration automatisch den Assistenten und
# fuehrt danach die Einzelschritte aus. Idempotent: jederzeit wiederholbar.
#
#   sudo ./install-ibm.sh
#   sudo IBM_ASSUME_YES=1 ./install-ibm.sh    # ohne Rueckfragen (Vorgaben)
# ============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/lib/common.sh"

require_root
require_openhab

log "=== Schritt 1/12: Konfiguration ==="
if [ -f "$IBM_CONF" ]; then
  log "Konfiguration vorhanden: $IBM_CONF"
  log "Neu erfassen mit: sudo $here/00-wizard.sh"
else
  "$here/00-wizard.sh"
fi

load_config

log "=== Schritt 2/12: Zeitzone und Regionaleinstellungen ==="
ensure_regional_settings

log "=== Schritt 3/12: Preflight ==="
if ! "$here/01-preflight.sh"; then
  warn "Preflight meldet Probleme."
  confirm "Trotzdem fortfahren?" || die "Abgebrochen."
fi

log "=== Schritt 4/12: Addons ==="
"$here/02-install-addons.sh"

log "=== Schritt 5/12: Items und Persistence ==="
"$here/03-install-items.sh"

log "=== Schritt 6/12: Regeln ==="
"$here/04-install-rules.sh"

log "=== Schritt 7/12: Overview-Seite ==="
"$here/05-install-overview.sh" \
  || warn "Overview-Seite nicht installiert - spaeter erneut: sudo $here/05-install-overview.sh"

log "=== Schritt 8/12: Verify ==="
"$here/06-verify.sh" || warn "Verify meldet Probleme - siehe oben."

log "=== Schritt 9/12: WireGuard-Fernwartung ==="
"$here/08-install-wireguard.sh" \
  || warn "Fernwartung nicht eingerichtet - spaeter erneut: sudo $here/08-install-wireguard.sh"

log "=== Schritt 10/12: SSH absichern ==="
"$here/09-harden-ssh.sh" \
  || warn "SSH nicht abgesichert - spaeter erneut: sudo $here/09-harden-ssh.sh"

log "=== Schritt 11/12: Standardpasswoerter ==="
"$here/10-change-passwords.sh" \
  || warn "Passwoerter nicht geaendert - spaeter erneut: sudo $here/10-change-passwords.sh"

log "=== Schritt 12/12: openHAB Cloud (myopenhab.org) ==="
"$here/07-myopenhab.sh" \
  || warn "openHAB Cloud noch nicht abgeschlossen - spaeter erneut: sudo $here/07-myopenhab.sh"

cat <<ENDE
[IBM]
[IBM] ===========================================================
[IBM]  Installation abgeschlossen.
[IBM] ===========================================================
[IBM]
[IBM] Wechselrichter: ${INVERTER_LABEL}
[IBM] Thing-UID:      ${INVERTER_THING_UID}
[IBM]
[IBM] Naechste Schritte in der Main UI (http://<pi>:8080):
[IBM]   1. Settings -> Add-ons pruefen (${INVERTER_BINDING}, JS Scripting, mapdb)
[IBM]   2. ${INVERTER_NOTES}
[IBM]   3. Settings -> Rules: die Regeln mit dem Tag "IBM" pruefen und
[IBM]      zum Testen einmal manuell ausfuehren.
[IBM]   4. Schalter "Batteriemanagement aktivieren" einschalten.
ENDE

if [ "$INSTALL_CLOUD" = "1" ]; then
  log "  5. Konto auf https://myopenhab.org anlegen - UUID und Secret stehen"
  log "     oben (erneut anzeigen: sudo $here/07-myopenhab.sh)."
fi

cat <<ENDE
[IBM]
[IBM] Logs beobachten:
[IBM]   tail -f ${OPENHAB_LOGDIR}/openhab.log | grep '\[IBM\]'
[IBM]
ENDE
