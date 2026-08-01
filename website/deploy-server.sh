#!/bin/bash
# Deploy der Website:
#   1. IBM-Paket bauen (landet in static/ibm/)
#   2. Dateien per rsync auf den Zielserver kopieren
#   3. Docker-Container auf dem Zielserver neu bauen und starten
#
# Ziele:
#   ./deploy-server.sh          s1.ischlstrom.org (Produktivserver, Hetzner)
#   ./deploy-server.sh server   Heimserver (nur Notfall, falls s1 ausfaellt)
#
# Je Ziel kann eine eigene Umgebungsdatei liegen (.env.s1 usw.) - sie wird
# auf dem Server als .env abgelegt. Ohne ziel-spezifische Datei gilt .env.
# Abweichender SSH-Benutzer: DEPLOY_USER=<name> ./deploy-server.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
remote_dir="~/Container/ischlstrom/website"

target="${1:-s1}"
case "$target" in
  # 3001: auf s1 belegt openHAB Cloud den Port 3000
  s1)     ssh_dest="${DEPLOY_USER:-martin}@s1.ischlstrom.org"; host_port=3001 ;;
  server) ssh_dest="${DEPLOY_USER:-martin}@server";            host_port=3000 ;;
  *)      echo "Unbekanntes Ziel: $target (moeglich: s1, server)" >&2; exit 1 ;;
esac

env_file="$here/.env"
if [ -f "$here/.env.$target" ]; then
  env_file="$here/.env.$target"
fi
[ -f "$env_file" ] || { echo "Umgebungsdatei fehlt: $env_file" >&2; exit 1; }

echo "Deploy nach $ssh_dest (Umgebung: $(basename "$env_file"))"

"$here/../Batteriemanagement/openhab/setup/build-dist.sh"

# .env-Dateien werden nicht mitsynchronisiert - unten landet genau die
# passende Datei als .env auf dem Server (--delete loescht Ausgeschlossenes
# auf der Gegenseite nicht).
rsync -av --delete --exclude='.env' --exclude='.env.*' "$here/" "$ssh_dest:$remote_dir/"
rsync -av "$env_file" "$ssh_dest:$remote_dir/.env"

ssh "$ssh_dest" "cd $remote_dir && HOST_PORT=$host_port ./update-docker-container.sh"
