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
# Das Update laedt Paket und Signatur (ibm-openhab.tgz.minisig), prueft die
# Signatur mit dem INSTALLIERTEN Release-Schluessel (setup/ibm-release.pub,
# minisign) und ruft dann setup/install-package.sh aus dem frisch
# entpackten Paket auf (Pruefsumme, ibm.conf uebernehmen, install-ibm.sh).
# Der Updater fuehrt damit nie Code aus, dessen Signatur er nicht geprueft
# hat - anders als der Bootstrap ibm/install.sh, der bei der ersten
# Installation TLS und ischlstrom.org vertrauen muss. Ein kompromittierter
# Server kann so kein Update mehr auf die Flotte schieben; dafuer braucht
# es den privaten Schluessel vom Entwicklungsrechner (build-dist.sh).
# Fehlt der Schluessel am Pi oder minisign, bleibt das Update aus (fail
# closed) und das Log sagt warum. Log: /var/log/ibm-update.log und
# journalctl -u ibm-update.
#
# Der Bootstrap fuehrt dieses Skript erneut aus und schreibt dabei
# /usr/local/sbin/ibm-update neu - waehrend der alte ibm-update noch laeuft.
# Bash liest ein Skript stueckweise von der Platte; wird die Datei
# unterdessen an Ort und Stelle ueberschrieben, liest der laufende Prozess
# ab dem alten Byte-Offset aus der neuen Datei weiter (am 2026-09-09 ein
# Syntaxfehler mitten in einem Kommentar, Service "failed", die Bereinigung
# der Sicherungen lief nie). Deshalb zweifach abgesichert: der Rumpf des
# Updaters steckt in einer Funktion main, die Bash komplett einliest, bevor
# sie laeuft, und die Datei wird atomar ersetzt (Tempdatei + mv), so dass
# ein laufender Prozess seinen alten Inode behaelt.
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

# minisign jetzt installieren, nicht erst im Update um 03:00 (dann haelt
# unattended-upgrades ab 03:40 die apt-Sperre). Ohne minisign spielt der
# Updater nichts ein.
if ! command -v minisign >/dev/null 2>&1; then
  log "Installiere minisign (apt-get) ..."
  apt-get install -y -qq -o DPkg::Lock::Timeout=120 minisign >/dev/null 2>&1 \
    || warn "minisign konnte nicht installiert werden - der Updater holt das beim naechsten Lauf nach; bis dahin keine Updates."
fi
[ -f "$IBM_SETUP_DIR/ibm-release.pub" ] \
  || warn "Release-Schluessel $IBM_SETUP_DIR/ibm-release.pub fehlt im Paket - der Updater wird Pakete ablehnen."

# Marker-Verzeichnis: der Status-Push laeuft als openHAB-Benutzer und muss
# die Anforderung dort ablegen koennen; der Timer laeuft als root.
mkdir -p "$IBM_REQUEST_DIR"
chown "$OPENHAB_USER:$OPENHAB_GROUP" "$IBM_REQUEST_DIR" 2>/dev/null || true
chmod 0755 "$IBM_REQUEST_DIR"

updater_tmp="$(mktemp "$UPDATER.XXXXXX")"
cat > "$updater_tmp" <<'UPD'
#!/usr/bin/env bash
# ibm-update - spielt das IBM-Paket von ischlstrom.org neu ein.
# Erzeugt von 09-install-updater.sh; Aufruf durch ibm-update.timer (root).
#   ibm-update            regulaerer Timer-Lauf (Marker oder Nachtfenster)
#   ibm-update --now      sofort aktualisieren (von Hand)
# Der ganze Ablauf steckt in main: das Update schreibt diese Datei selbst
# neu, und Bash darf dann nichts mehr von der Platte nachlesen.
set -uo pipefail

main() {
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

# Fail closed: ohne Schluessel oder minisign wird nichts eingespielt.
PUBKEY=@IBM_SETUP_DIR@/ibm-release.pub
if [ ! -f "$PUBKEY" ]; then
  log "Release-Schluessel $PUBKEY fehlt - Update abgebrochen (Paket von Hand mit install.sh einspielen)."
  exit 1
fi
if ! command -v minisign >/dev/null 2>&1; then
  log "minisign fehlt - versuche apt-get install ..."
  apt-get install -y -qq -o DPkg::Lock::Timeout=120 minisign >> "$LOG" 2>&1 \
    || { log "minisign nicht installierbar - Update abgebrochen."; exit 1; }
fi

# /run ist tmpfs: nichts bleibt nach einem Neustart liegen; install-package.sh
# loescht das Verzeichnis nach dem Einspielen (--cleanup).
tmp="$(mktemp -d /run/ibm-update.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
for f in ibm-openhab.tgz ibm-openhab.tgz.minisig ibm-openhab.tgz.sha256; do
  if ! curl -fsSL -m 120 "$base/ibm/$f" -o "$tmp/$f"; then
    log "$f nicht abrufbar ($base) - Update abgebrochen."
    exit 1
  fi
done
if ! ( cd "$tmp" && sha256sum -c ibm-openhab.tgz.sha256 >/dev/null 2>&1 ); then
  log "Pruefsumme stimmt nicht (unvollstaendiger Download?) - Update abgebrochen."
  exit 1
fi
if ! minisign -Vq -p "$PUBKEY" -m "$tmp/ibm-openhab.tgz" -x "$tmp/ibm-openhab.tgz.minisig" >> "$LOG" 2>&1; then
  log "SIGNATUR UNGUELTIG - das Paket auf $base stammt nicht vom Release-Schluessel. Nichts eingespielt."
  exit 1
fi
log "Signatur OK."
mkdir -p "$tmp/pkg"
if ! tar -xzf "$tmp/ibm-openhab.tgz" -C "$tmp/pkg" || [ ! -f "$tmp/pkg/openhab/setup/install-package.sh" ]; then
  log "Paket unerwartet aufgebaut (setup/install-package.sh fehlt) - Update abgebrochen."
  exit 1
fi

rc=0
trap - EXIT
IBM_ASSUME_YES=1 IBM_BASE_URL="$base" bash "$tmp/pkg/openhab/setup/install-package.sh" \
  --from "$tmp/pkg/openhab" --sha256 "$tmp/ibm-openhab.tgz.sha256" --cleanup "$tmp" >> "$LOG" 2>&1 || rc=$?
rm -rf "$tmp"
# Die Sicherungen (openhab.bak-<zeit>) duennt install-package.sh selbst aus.
if [ "$rc" -eq 0 ]; then
  log "Update abgeschlossen."
elif [ "$rc" -eq 75 ]; then
  log "Update eingespielt, Einrichtung noch unvollstaendig (Exit 75) - siehe Dashboard."
else
  log "Update fehlgeschlagen (Exit $rc) - Details oben in $LOG."
fi
exit "$rc"
}

main "$@"
exit
UPD
sed -i -e "s|@IBM_CONF@|$IBM_CONF|g" \
       -e "s|@IBM_UPDATE_FLAG@|$IBM_UPDATE_FLAG|g" \
       -e "s|@IBM_REQUEST_DIR@|$IBM_REQUEST_DIR|g" \
       -e "s|@IBM_SETUP_DIR@|$IBM_SETUP_DIR|g" "$updater_tmp"
chown root:root "$updater_tmp"
chmod 0755 "$updater_tmp"
if [ -f "$UPDATER" ] && cmp -s "$updater_tmp" "$UPDATER"; then
  rm -f "$updater_tmp"
  log "unveraendert: $UPDATER"
else
  mv -f "$updater_tmp" "$UPDATER"
  log "geschrieben: $UPDATER"
fi

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
