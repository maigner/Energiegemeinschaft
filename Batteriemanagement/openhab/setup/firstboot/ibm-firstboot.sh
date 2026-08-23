#!/usr/bin/env bash
# ============================================================================
# ibm-firstboot - startet die Zero-Touch-Einrichtung des ISCHLSTROM
# Speichermanagements nach der openHABian-Erstinstallation.
#
# Wird von prepare-sd.sh in die Root-Partition der SD-Karte gelegt
# (/usr/local/sbin/ibm-firstboot, systemd-Unit ibm-firstboot.service) und
# laeuft bei jedem Boot, bis die Einrichtung abgeschlossen ist:
#
#   1. Ohne /boot/firmware/ibm-provision.conf (Code vom Vorstand) nichts tun.
#   2. Warten, bis openHABian fertig ist (/opt/openHABian-install-successful;
#      openHABian startet danach selbst neu) und openHAB per REST antwortet.
#   3. install.sh von IBM_BASE_URL laden und ausfuehren (Code wird dort von
#      der Boot-Partition gelesen, keine Rueckfragen).
#   4. Erfolg: Marker setzen, ibm-provision.conf von der Karte loeschen.
#      Misserfolg oder "unvollstaendig" (Exit 75, z. B. Wechselrichter-
#      Passwort fehlt noch): in 10 Minuten erneut - ohne Neustart.
#
# Log: journalctl -u ibm-firstboot  und  /var/log/ibm-firstboot.log
# ============================================================================
set -uo pipefail

MARKER=/var/lib/ischlstrom/provisioned
LOG=/var/log/ibm-firstboot.log
RETRY_SECONDS=600

log() { echo "[ibm-firstboot] $(date '+%F %T') $*" | tee -a "$LOG"; }

conf=""
for f in /boot/firmware/ibm-provision.conf /boot/ibm-provision.conf; do
  [ -f "$f" ] && { conf="$f"; break; }
done
if [ -f "$MARKER" ]; then
  log "Einrichtung bereits abgeschlossen ($MARKER)."
  [ -n "$conf" ] && rm -f "$conf"
  exit 0
fi
if [ -z "$conf" ]; then
  log "Keine ibm-provision.conf auf der Boot-Partition - nichts zu tun."
  exit 0
fi

# --- auf openHABian und openHAB warten --------------------------------------
while [ ! -f /opt/openHABian-install-successful ]; do
  if [ -f /opt/openHABian-install-failed ]; then
    log "openHABian meldet eine fehlgeschlagene Erstinstallation - warte auf Neustart/erneuten Versuch."
  fi
  sleep 60
done
log "openHABian-Erstinstallation abgeschlossen; warte auf openHAB ..."
until [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:8080/rest/ 2>/dev/null)" = "200" ]; do
  sleep 15
done
log "openHAB antwortet."

# --- Einrichtung, mit Wiederholung --------------------------------------------
while :; do
  # shellcheck disable=SC1090
  . "$conf"
  base="${IBM_BASE_URL:-https://ischlstrom.org}"
  log "Starte Einrichtung von $base (Code ${IBM_PROVISION_CODE:-?}) ..."
  rc=0
  if curl -fsSL -m 60 "$base/ibm/install.sh" -o /run/ibm-install.sh; then
    IBM_PROVISION_CODE="${IBM_PROVISION_CODE:-}" IBM_BASE_URL="$base" IBM_ASSUME_YES=1 \
      bash /run/ibm-install.sh >> "$LOG" 2>&1 || rc=$?
  else
    rc=1
    log "install.sh nicht erreichbar ($base) - Internetverbindung?"
  fi

  if [ "$rc" -eq 0 ]; then
    mkdir -p "$(dirname "$MARKER")"
    date '+%F %T' > "$MARKER"
    rm -f "$conf"
    log "Einrichtung abgeschlossen."
    exit 0
  fi
  if [ "$rc" -eq 75 ]; then
    log "Einrichtung noch unvollstaendig - naechster Versuch in $((RETRY_SECONDS / 60)) Minuten."
  else
    log "Einrichtung fehlgeschlagen (Exit $rc) - naechster Versuch in $((RETRY_SECONDS / 60)) Minuten. Details: $LOG"
  fi
  sleep "$RETRY_SECONDS"
done
