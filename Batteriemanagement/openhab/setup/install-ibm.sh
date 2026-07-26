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

log "=== Schritt 1/6: Konfiguration ==="
if [ -f "$IBM_CONF" ]; then
  log "Konfiguration vorhanden: $IBM_CONF"
  log "Neu erfassen mit: sudo $here/00-wizard.sh"
else
  "$here/00-wizard.sh"
fi

load_config

log "=== Schritt 2/6: Preflight ==="
if ! "$here/01-preflight.sh"; then
  warn "Preflight meldet Probleme."
  confirm "Trotzdem fortfahren?" || die "Abgebrochen."
fi

log "=== Schritt 3/6: Addons ==="
"$here/02-install-addons.sh"

log "=== Schritt 4/6: Items und Persistence ==="
"$here/03-install-items.sh"

log "=== Schritt 5/6: Regeln ==="
"$here/04-install-rules.sh"

log "=== Schritt 6/6: Verify ==="
"$here/05-verify.sh" || warn "Verify meldet Probleme - siehe oben."

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
[IBM]   3. Settings -> Rules: die vier Regeln mit dem Tag "IBM" pruefen und
[IBM]      zum Testen einmal manuell ausfuehren.
[IBM]   4. Schalter "Batteriemanagement aktivieren" einschalten.
[IBM]
[IBM] Logs beobachten:
[IBM]   tail -f ${OPENHAB_LOGDIR}/openhab.log | grep '\[IBM\]'
[IBM]
ENDE
