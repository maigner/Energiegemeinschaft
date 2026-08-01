#!/bin/bash
# Frischer Dump der Auth.js-DB vom Heimserver ("server").
# Passwort kommt aus notebooks/.pgpass (Host "server" muss dort stehen).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGPASSFILE="$here/../notebooks/.pgpass"

# --no-owner/--no-privileges: siehe export-server-db-middleware.sh
pg_dump --no-owner --no-privileges \
    "host=server user=ischlstrom_authjs_website dbname=ischlstrom_authjs_website sslmode=require" \
    > "$here/authjs-website.dmp"
echo "geschrieben: $here/authjs-website.dmp ($(du -h "$here/authjs-website.dmp" | cut -f1))"
