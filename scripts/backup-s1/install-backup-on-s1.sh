#!/bin/bash
# Installiert das naechtliche Backup auf s1 (vom Entwicklungsrechner aus):
# kopiert Skripte + systemd-Units hoch und aktiviert den Timer.
# sudo auf s1 fragt dabei nach dem Passwort.
#
#   ./install-backup-on-s1.sh
#   S1=benutzer@s1.ischlstrom.org ./install-backup-on-s1.sh
#   BACKUP_MAIL_TO=wer@example.org ./install-backup-on-s1.sh
#
# /etc/default/s1-backup (Empfaenger der Ergebnis-Mail, optional KEEP_DAYS,
# MAILCOW_KEEP_DAYS, BACKUP_ROOT) wird nur angelegt, wenn es noch fehlt -
# eine bestehende Datei bleibt unangetastet.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"
BACKUP_MAIL_TO="${BACKUP_MAIL_TO:-martin@maigner.net}"

tmp="$(mktemp)"
printf 'BACKUP_MAIL_TO=%s\n' "$BACKUP_MAIL_TO" > "$tmp"

scp -q "$here/s1-backup.sh" "$here/s1-backup-notify.sh" \
  "$here/s1-backup.service" "$here/s1-backup.timer" "$S1:/tmp/"
scp -q "$tmp" "$S1:/tmp/s1-backup.default"
rm -f "$tmp"

ssh -t "$S1" '
  sudo install -m 0755 /tmp/s1-backup.sh /tmp/s1-backup-notify.sh /usr/local/bin/ &&
  sudo install -m 0644 /tmp/s1-backup.service /tmp/s1-backup.timer /etc/systemd/system/ &&
  { [ -e /etc/default/s1-backup ] || sudo install -m 0644 /tmp/s1-backup.default /etc/default/s1-backup; } &&
  rm -f /tmp/s1-backup.sh /tmp/s1-backup-notify.sh /tmp/s1-backup.service /tmp/s1-backup.timer /tmp/s1-backup.default &&
  sudo systemctl daemon-reload &&
  sudo systemctl enable --now s1-backup.timer &&
  echo "Ergebnis-Mail geht an: $(cat /etc/default/s1-backup)" &&
  systemctl list-timers s1-backup.timer --no-pager
'

cat <<HINWEIS

Timer aktiv (naechtlich 03:14). Ersten Lauf jetzt testen (dauert je nach
mailcow-Groesse einige Minuten); danach sollte die Ergebnis-Mail da sein:

  ssh -t ${S1} 'sudo systemctl start s1-backup.service; sudo journalctl -u s1-backup -n 30 --no-pager'
HINWEIS
