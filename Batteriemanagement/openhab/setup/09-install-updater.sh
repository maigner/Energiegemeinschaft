#!/usr/bin/env bash
# ============================================================================
# 09 - Selbst-Update des IBM-Pakets
#
# Richtet einen root-Timer (ibm-update.timer, alle 10 Minuten) ein, der das
# IBM-Paket von ischlstrom.org neu einspielt:
#   * sofort, wenn der Vorstand am Dashboard "Paket aktualisieren" gedrueckt
#     hat - der Status-Push (ibm_status_push.js) bekommt das in der Antwort
#     und legt die Marker-Datei $IBM_UPDATE_FLAG an;
#   * sonst einmal taeglich zwischen 03:00 und 05:00, wenn die Pruefsumme
#     des Pakets auf dem Server von der installierten abweicht
#     (INSTALL_AUTO_UPDATE=1, Vorgabe).
# Das Update ist der normale Bootstrap (ibm/install.sh): Paket laden,
# Pruefsumme, ibm.conf uebernehmen, install-ibm.sh. Log: /var/log/ibm-update.log
# und journalctl -u ibm-update.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
load_config

UPDATER=/usr/local/sbin/ibm-update
UNIT_DIR=/etc/systemd/system

if [ "$INSTALL_AUTO_UPDATE" != "1" ]; then
  if systemctl is-enabled --quiet ibm-update.timer 2>/dev/null; then
    systemctl disable --now ibm-update.timer >/dev/null 2>&1 || true
    log "INSTALL_AUTO_UPDATE=0 - ibm-update.timer abgeschaltet."
  else
    log "INSTALL_AUTO_UPDATE=0 - Selbst-Update uebersprungen."
  fi
  exit 0
fi

# Marker-Verzeichnis: der Status-Push laeuft als openHAB-Benutzer und muss
# die Anforderung dort ablegen koennen; der Timer laeuft als root.
mkdir -p "$IBM_REQUEST_DIR"
chown "$OPENHAB_USER:$OPENHAB_GROUP" "$IBM_REQUEST_DIR" 2>/dev/null || true
chmod 0755 "$IBM_REQUEST_DIR"

install_file "$UPDATER" <<'UPD'
#!/usr/bin/env bash
# ibm-update - spielt das IBM-Paket von ischlstrom.org neu ein.
# Erzeugt von 09-install-updater.sh; Aufruf durch ibm-update.timer (root).
#   ibm-update            regulaerer Timer-Lauf (Marker oder Nachtfenster)
#   ibm-update --now      sofort aktualisieren (von Hand)
set -uo pipefail

CONF=@IBM_CONF@
FLAG=@IBM_UPDATE_FLAG@
STAMP=@IBM_REQUEST_DIR@/last-check
LOG=/var/log/ibm-update.log
INSTALLED=@IBM_SETUP_DIR@/../PACKAGE-SHA256
LOCK=/run/ibm-update.lock

log() { echo "[ibm-update] $(date '+%F %T') $*" | tee -a "$LOG"; }

exec 9>"$LOCK"
flock -n 9 || { log "Ein Update laeuft bereits."; exit 0; }

base=https://ischlstrom.org
# shellcheck disable=SC1090
[ -f "$CONF" ] && base="$(. "$CONF" 2>/dev/null; echo "${IBM_API_BASE:-https://ischlstrom.org}")"

reason=""
if [ "${1:-}" = "--now" ]; then
  reason="von Hand"
elif [ -f "$FLAG" ]; then
  reason="vom Dashboard angefordert"
else
  hour=$(date +%H); today=$(date +%F)
  if [ "$hour" -ge 3 ] && [ "$hour" -lt 5 ] && [ "$(cat "$STAMP" 2>/dev/null || true)" != "$today" ]; then
    echo "$today" > "$STAMP"
    remote="$(curl -fsSL -m 30 "$base/ibm/ibm-openhab.tgz.sha256" 2>/dev/null | awk '{print $1}' || true)"
    local_sha="$(awk '{print $1}' "$INSTALLED" 2>/dev/null || true)"
    if [ -z "$remote" ]; then
      log "Naechtliche Pruefung: Pruefsumme nicht abrufbar ($base) - kein Update."
      exit 0
    fi
    if [ "$remote" = "$local_sha" ]; then
      log "Naechtliche Pruefung: Paket ist aktuell."
      exit 0
    fi
    reason="neues Paket auf $base"
  fi
fi
[ -n "$reason" ] || exit 0

rm -f "$FLAG"
log "Update startet ($reason) ..."
if ! curl -fsSL -m 60 "$base/ibm/install.sh" -o /run/ibm-install.sh; then
  log "install.sh nicht erreichbar ($base) - Update abgebrochen."
  exit 1
fi
rc=0
IBM_ASSUME_YES=1 IBM_BASE_URL="$base" bash /run/ibm-install.sh >> "$LOG" 2>&1 || rc=$?
rm -f /run/ibm-install.sh
# install.sh sichert die alte Installation als openhab.bak-<zeit>; nur die
# letzten drei Sicherungen behalten, sonst fuellt sich die SD-Karte.
ls -dt "$(dirname "@IBM_SETUP_DIR@")"/openhab.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
if [ "$rc" -eq 0 ]; then
  log "Update abgeschlossen."
elif [ "$rc" -eq 75 ]; then
  log "Update eingespielt, Einrichtung noch unvollstaendig (Exit 75) - siehe Dashboard."
else
  log "Update fehlgeschlagen (Exit $rc) - Details oben in $LOG."
fi
exit "$rc"
UPD
sed -i -e "s|@IBM_CONF@|$IBM_CONF|g" \
       -e "s|@IBM_UPDATE_FLAG@|$IBM_UPDATE_FLAG|g" \
       -e "s|@IBM_REQUEST_DIR@|$IBM_REQUEST_DIR|g" \
       -e "s|@IBM_SETUP_DIR@|$IBM_SETUP_DIR|g" "$UPDATER"
chown root:root "$UPDATER"
chmod 0755 "$UPDATER"

install_file "$UNIT_DIR/ibm-update.service" <<'UNIT'
[Unit]
Description=ISCHLSTROM Speichermanagement - Paket-Update
After=network-online.target openhab.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/ibm-update
UNIT
install_file "$UNIT_DIR/ibm-update.timer" <<'UNIT'
[Unit]
Description=ISCHLSTROM Speichermanagement - Paket-Update pruefen

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
RandomizedDelaySec=2min

[Install]
WantedBy=timers.target
UNIT
chown root:root "$UNIT_DIR/ibm-update.service" "$UNIT_DIR/ibm-update.timer"

systemctl daemon-reload
systemctl enable --now ibm-update.timer >/dev/null 2>&1 \
  || warn "ibm-update.timer konnte nicht aktiviert werden."
log "Selbst-Update eingerichtet: ibm-update.timer (alle 10 min; naechtliche Paketpruefung, Dashboard-Anforderung sofort)."
