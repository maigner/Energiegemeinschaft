#!/bin/bash
# Richtet den naechtlichen Dev-DB-Refresh auf dem Heimserver ("server") ein
# (vom Entwicklungsrechner aus): kopiert refresh-dev-db.sh hoch, ergaenzt
# ~/.pgpass auf dem Heimserver um die "server"-Zeilen aus notebooks/.pgpass
# und traegt den Cron-Job ein (06:00, nach der Backup-Abholung um 05:30).
# Idempotent - ein erneuter Lauf aktualisiert nur das Skript.
#
#   ./install-dev-db-refresh.sh
#   SERVER=benutzer@server ./install-dev-db-refresh.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="${SERVER:-martin@server}"

pgpass="$here/../notebooks/.pgpass"
[ -f "$pgpass" ] || { echo "FEHLER: $pgpass fehlt." >&2; exit 1; }

scp -q "$here/refresh-dev-db.sh" "$SERVER:/home/martin/refresh-dev-db.sh"

# Nur die Zeilen fuer Host "server" uebertragen; bestehende Eintraege auf dem
# Heimserver bleiben, doppelte werden nicht angelegt.
grep '^server:' "$pgpass" | ssh "$SERVER" '
    touch ~/.pgpass && chmod 600 ~/.pgpass
    while IFS= read -r line; do
        grep -qxF "$line" ~/.pgpass || echo "$line" >> ~/.pgpass
    done
    chmod +x /home/martin/refresh-dev-db.sh
    entry="0 6 * * * /home/martin/refresh-dev-db.sh >> /home/martin/backups-s1/refresh-dev-db.log 2>&1"
    (crontab -l 2>/dev/null | grep -vF "refresh-dev-db.sh"; echo "$entry") | crontab -
    echo "Cron auf dem Heimserver:"
    crontab -l | grep -v "^#"
'

echo "Fertig. Ersten Lauf jetzt testen:"
echo "  ssh $SERVER /home/martin/refresh-dev-db.sh"
