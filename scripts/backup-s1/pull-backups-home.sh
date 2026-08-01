#!/bin/bash
# Offsite-Kopie: holt die naechtlichen Backups von s1 auf den Heimserver.
# Laeuft auf dem Heimserver ("server") als martin - Pull, damit s1 den
# Heimserver nicht erreichen muss.
#
# Einrichtung auf dem Heimserver:
#   1. Falls noch kein Schluessel: ssh-keygen -t ed25519
#      und den Public Key auf s1 in ~/.ssh/authorized_keys eintragen.
#   2. Dieses Skript nach /home/martin/pull-backups-s1.sh kopieren (chmod +x).
#   3. crontab -e:
#      30 5 * * * /home/martin/pull-backups-s1.sh >> /home/martin/backups-s1/pull.log 2>&1
#
# --delete spiegelt die Rotation von s1 - das Aufbewahrungsfenster ist
# also dasselbe wie dort (KEEP_DAYS bzw. MAILCOW_KEEP_DAYS).
set -euo pipefail

SRC="${SRC:-martin@s1.ischlstrom.org:/var/backups/s1/}"
DEST="${DEST:-/home/martin/backups-s1/}"

mkdir -p "$DEST"
rsync -a --delete -e "ssh -o BatchMode=yes" "$SRC" "$DEST"
echo "$(date -Is) Abholung ok, Belegung: $(du -sh "$DEST" | cut -f1)"
