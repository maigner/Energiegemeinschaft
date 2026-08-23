#!/bin/bash
# Installiert den Provisionierungs-Abgleich auf s1 (vom Entwicklungsrechner
# aus, wie scripts/backup-s1/install-backup-on-s1.sh): kopiert dieses
# Verzeichnis nach s1 und fuehrt dort setup-on-s1.sh als root aus
# (Skripte, Timer, wg0.base.conf, Uebernahme der bestehenden Peers).
# sudo auf s1 fragt dabei nach dem Passwort. Wiederholbar.
#
#   ./install-on-s1.sh
#   S1=benutzer@s1.ischlstrom.org ./install-on-s1.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"

ssh "$S1" 'rm -rf /tmp/ibm-provision && mkdir -p /tmp/ibm-provision'
scp -q "$here"/ibm-provision-sync.sh "$here"/ibm-provision-sync.service "$here"/ibm-provision-sync.timer \
       "$here"/cloud-makeuser.js "$here"/setup-on-s1.sh "$S1:/tmp/ibm-provision/"

# LC_ALL=C: s1 hat die Locale des Entwicklungsrechners nicht (Perl-Warnungen)
ssh -t "$S1" '
  export LC_ALL=C &&
  sudo bash /tmp/ibm-provision/setup-on-s1.sh &&
  rm -rf /tmp/ibm-provision &&
  systemctl list-timers ibm-provision-sync.timer --no-pager
'

cat <<HINWEIS

Fertig. Pruefen:
  ssh $S1 "sudo journalctl -u ibm-provision-sync -n 30 --no-pager"
  ssh $S1 "sudo cat /etc/ibm-provision.conf"   # Pfade (WEBSITE_ENV, CLOUD_COMPOSE_DIR)
Die Website-.env auf s1 braucht IBM_SECRET_KEY und MAILCOW_API_KEY
(website/.env.s1, kommt mit deploy-server.sh).
HINWEIS
