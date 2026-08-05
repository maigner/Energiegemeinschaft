#!/bin/bash
# Spielt authjs-website.dmp in die Auth.js-DB auf s1.ischlstrom.org ein
# (direkt per hostssl).
# Die Ziel-DB muss leer sein - vorher setup-s1-postgres.sh; fuer einen
# zweiten Versuch die DB auf s1 droppen und neu anlegen.
# Passwort: notebooks/.pgpass braucht eine Zeile fuer s1.ischlstrom.org
# (sonst fragt psql nach).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGPASSFILE="$here/../notebooks/.pgpass"

psql "host=s1.ischlstrom.org user=ischlstrom_authjs_website dbname=ischlstrom_authjs_website sslmode=require" \
    -v ON_ERROR_STOP=1 < "$here/authjs-website.dmp"
echo "Auth.js-DB auf s1 eingespielt."
