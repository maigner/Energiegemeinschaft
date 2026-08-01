#!/bin/bash
# Installiert das naechtliche Backup auf s1 (vom Entwicklungsrechner aus):
# kopiert Skript + systemd-Units hoch und aktiviert den Timer.
# sudo auf s1 fragt dabei nach dem Passwort.
#
#   ./install-backup-on-s1.sh
#   S1=benutzer@s1.ischlstrom.org ./install-backup-on-s1.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"

scp -q "$here/s1-backup.sh" "$here/s1-backup.service" "$here/s1-backup.timer" "$S1:/tmp/"

ssh -t "$S1" '
  sudo install -m 0755 /tmp/s1-backup.sh /usr/local/bin/s1-backup.sh &&
  sudo install -m 0644 /tmp/s1-backup.service /tmp/s1-backup.timer /etc/systemd/system/ &&
  rm -f /tmp/s1-backup.sh /tmp/s1-backup.service /tmp/s1-backup.timer &&
  sudo systemctl daemon-reload &&
  sudo systemctl enable --now s1-backup.timer &&
  systemctl list-timers s1-backup.timer --no-pager
'

cat <<HINWEIS

Timer aktiv (naechtlich 03:14). Ersten Lauf jetzt testen (dauert je nach
mailcow-Groesse einige Minuten):

  ssh -t ${S1} 'sudo systemctl start s1-backup.service && sudo journalctl -u s1-backup -n 30 --no-pager'
HINWEIS
