#!/bin/bash
# Spielt middleware.dmp in die Middleware-DB auf s1.ischlstrom.org ein
# (direkt per hostssl).
# Die Ziel-DB muss leer sein - vorher setup-s1-postgres.sh; fuer einen
# zweiten Versuch die DB auf s1 droppen und neu anlegen:
#   sudo -u postgres psql -c 'DROP DATABASE ischlstrom_middleware'
#   ./setup-s1-postgres.sh
# Passwort: notebooks/.pgpass braucht eine Zeile fuer s1.ischlstrom.org
# (sonst fragt psql nach).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGPASSFILE="$here/../notebooks/.pgpass"

psql "host=s1.ischlstrom.org user=ischlstrom_middleware dbname=ischlstrom_middleware sslmode=require" \
    -v ON_ERROR_STOP=1 < "$here/middleware.dmp"
echo "Middleware-DB auf s1 eingespielt."
