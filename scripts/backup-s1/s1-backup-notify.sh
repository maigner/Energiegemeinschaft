#!/bin/bash
# ============================================================================
# Mail-Benachrichtigung nach jedem Backup-Lauf. Wird von s1-backup.service
# als ExecStopPost gestartet - also auch, wenn s1-backup.sh abgebrochen ist.
#
# systemd liefert SERVICE_RESULT / EXIT_STATUS (Ergebnis des Hauptprozesses)
# und INVOCATION_ID (gleich fuer alle Prozesse dieses Laufs), darueber wird
# das Protokoll genau dieses Laufs aus dem Journal geholt.
#
# Empfaenger: BACKUP_MAIL_TO aus /etc/default/s1-backup (schreibt
# install-backup-on-s1.sh). Versand ueber das Host-Postfix, das an mailcow
# (127.0.0.1:587, SASL) weiterreicht.
# ============================================================================
set -uo pipefail

to="${BACKUP_MAIL_TO:-root}"
from="${BACKUP_MAIL_FROM:-root@s1.ischlstrom.org}"
result="${SERVICE_RESULT:-unbekannt}"
status="${EXIT_STATUS:-?}"

if [ "$result" = "success" ]; then
  verdict="OK"
else
  verdict="FEHLER ($result, exit $status)"
fi

journalctl --sync 2>/dev/null || true
log="$(journalctl _SYSTEMD_INVOCATION_ID="${INVOCATION_ID:-}" --no-pager -o cat 2>/dev/null \
  | grep -v 'pam_unix(runuser')"
[ -n "$log" ] || log="(kein Journal fuer diesen Lauf gefunden)"
summary="$(printf '%s\n' "$log" | grep -E '^\[s1-backup\] Fertig' | tail -1)"

{
  echo "Backup auf $(hostname) am $(date '+%Y-%m-%d %H:%M'): $verdict"
  [ -n "$summary" ] && echo "$summary"
  echo
  df -h / /mnt/backup 2>/dev/null
  echo
  echo "--- Protokoll ---"
  printf '%s\n' "$log"
} | mail -s "[s1-backup] $verdict $(date +%F)" -r "$from" "$to"
