#!/bin/bash
# Deploy der Website auf den Server:
#   1. IBM-Paket bauen (landet in static/ibm/)
#   2. Dateien per rsync auf den Server kopieren
#   3. Docker-Container auf dem Server neu bauen und starten
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
remote_dir="~/Container/ischlstrom/website"

"$here/../Batteriemanagement/openhab/setup/build-dist.sh"

rsync -av --delete "$here/" "martin@server:$remote_dir/"

ssh martin@server "cd $remote_dir && ./update-docker-container.sh"
