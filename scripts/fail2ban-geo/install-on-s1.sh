#!/bin/bash
# Installiert fail2ban-geo auf s1 (vom Entwicklungsrechner aus, wie
# scripts/eegfaktura-import/install-on-s1.sh): kopiert dieses Verzeichnis
# nach s1 und fuehrt dort setup-on-s1.sh als root aus. sudo auf s1 fragt
# nach dem Passwort. Wiederholbar - auch fuer Updates des Skripts.
#
#   ./install-on-s1.sh
#   S1=benutzer@s1.ischlstrom.org ./install-on-s1.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"

ssh "$S1" 'rm -rf /tmp/fail2ban-geo && mkdir -p /tmp/fail2ban-geo'
scp -q "$here"/fail2ban_geo.py "$here"/fail2ban-geo-update.sh \
       "$here"/fail2ban-geo.service "$here"/fail2ban-geo.timer \
       "$here"/fail2ban-geo-update.service "$here"/fail2ban-geo-update.timer \
       "$here"/setup-on-s1.sh \
       "$S1:/tmp/fail2ban-geo/"

# LC_ALL=C: s1 hat die Locale des Entwicklungsrechners nicht (Perl-Warnungen)
ssh -t "$S1" '
  export LC_ALL=C &&
  sudo bash /tmp/fail2ban-geo/setup-on-s1.sh &&
  rm -rf /tmp/fail2ban-geo
'

cat <<HINWEIS

Fertig. Pruefen:
  ssh -t $S1 "sudo journalctl -u fail2ban-geo -n 20 --no-pager"
  ssh -t $S1 "sudo python3 /usr/local/lib/fail2ban-geo/fail2ban_geo.py --dry-run"
Die Karte steht auf https://ischlstrom.org/board/security (nach dem Deploy der Website).
HINWEIS
