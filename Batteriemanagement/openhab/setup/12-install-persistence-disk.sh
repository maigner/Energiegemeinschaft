#!/usr/bin/env bash
# ============================================================================
# 12 - Persistence-Daten auf die SD-Karte statt ins zram
#
# openHABian legt /var/lib/openhab/persistence (mapdb, rrd4j) und /var/log
# per zram-config (/etc/ztab) auf ein Overlay im RAM und schreibt es erst
# beim sauberen Herunterfahren auf die SD-Karte zurueck. Fuer das
# Batteriemanagement ist das fatal: in mapdb liegen der Einspeise-Zaehler,
# das Sonnenprofil, die Kapazitaets- und die Hauslastschaetzung sowie die
# Einstellungen des Mitglieds (restoreOnStartup). Nach einem Stromausfall
# kommt davon der Stand des letzten sauberen Neustarts zurueck - auf pi-020
# am 2026-10-09 drei Wochen alt (Zaehler 36 -> 12 kWh, Lernzustand von
# Mitte September).
#
# Der naechtliche Sync, den openHABian mitbringt (zsync.timer), ist keine
# Loesung: "zram-config sync" haengt das Overlay aus und neu ein, waehrend
# openHAB die mapdb-Dateien offen hat (lazy umount - openHAB schreibt
# danach in ein abgehaengtes Overlay); openHABian selbst laesst den Timer
# deshalb deaktiviert.
#
# Dieses Skript nimmt deshalb nur den Persistence-Eintrag aus /etc/ztab
# (die Zeile bleibt auskommentiert mit Marker erhalten); /var/log bleibt im
# zram. Die Schreiblast ist klein: mapdb schreibt alle 5 Minuten ein paar
# Items, rrd4j minuetlich eine Handvoll Zahlenwerte - weit unter dem, was
# eine SD-Karte vertraegt. Wirksam wird die Aenderung beim naechsten
# sauberen Neustart: zram-config liest ztab nur beim Start, und beim Stop
# schreibt es das Overlay mitsamt dem aktuellen mapdb-Stand auf die
# SD-Karte zurueck. Bis dahin liegt mapdb weiter im RAM - ein geplanter
# Neustart (Dashboard oder apt) raeumt das auf, ein Stromausfall nicht.
#
# INSTALL_PERSISTENCE_DISK=0 in ibm.conf stellt die openHABian-Vorgabe
# wieder her (Marker entfernen, wirksam ebenfalls beim naechsten Neustart).
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
load_config

ZTAB=/etc/ztab
PERSIST_DIR=/var/lib/openhab/persistence
MARKER='#ibm-disk# '

if [ ! -f "$ZTAB" ]; then
  log "Kein $ZTAB - zram-config nicht installiert, Persistence liegt auf der SD-Karte."
  exit 0
fi

# Aktive (unkommentierte) dir-Zeile fuer das Persistence-Verzeichnis
active_re="^[[:space:]]*dir[[:space:]].*[[:space:]]${PERSIST_DIR}[[:space:]]"
marked_re="^${MARKER}dir[[:space:]].*[[:space:]]${PERSIST_DIR}[[:space:]]"

overlay_mounted() {
  findmnt -t overlay -n "$PERSIST_DIR" >/dev/null 2>&1
}

if [ "$INSTALL_PERSISTENCE_DISK" != "1" ]; then
  if grep -qE "$marked_re" "$ZTAB"; then
    sed -i "s|^${MARKER}\(dir[[:space:]].*[[:space:]]${PERSIST_DIR}[[:space:]].*\)$|\1|" "$ZTAB"
    log "INSTALL_PERSISTENCE_DISK=0 - Persistence-Eintrag in $ZTAB wiederhergestellt (wirksam beim naechsten Neustart)."
  else
    log "INSTALL_PERSISTENCE_DISK=0 - $ZTAB unveraendert."
  fi
  exit 0
fi

if grep -qE "$active_re" "$ZTAB"; then
  cp -p "$ZTAB" "$ZTAB.bak-$(date +%Y%m%d%H%M%S)"
  sed -i "s|^\([[:space:]]*dir[[:space:]].*[[:space:]]${PERSIST_DIR}[[:space:]].*\)$|${MARKER}\1|" "$ZTAB"
  log "Persistence-Eintrag in $ZTAB auskommentiert ($PERSIST_DIR bleibt kuenftig auf der SD-Karte)."
elif grep -qE "$marked_re" "$ZTAB"; then
  log "$ZTAB bereits angepasst ($PERSIST_DIR ohne zram)."
else
  log "$ZTAB kennt keinen Eintrag fuer $PERSIST_DIR - nichts zu tun."
fi

if overlay_mounted; then
  warn "$PERSIST_DIR liegt noch im zram (Overlay aktiv) - wirksam wird die Aenderung beim naechsten sauberen Neustart; bis dahin geht der mapdb-Stand bei einem Stromausfall verloren."
else
  log "$PERSIST_DIR liegt auf der SD-Karte (kein Overlay aktiv)."
fi
