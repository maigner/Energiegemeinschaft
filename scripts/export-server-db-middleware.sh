#!/bin/bash
# Frischer Dump der Middleware-DB vom Heimserver ("server").
# Passwort kommt aus notebooks/.pgpass (Host "server" muss dort stehen).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGPASSFILE="$here/../notebooks/.pgpass"

pg_dump "host=server user=ischlstrom_middleware dbname=ischlstrom_middleware sslmode=require" \
    > "$here/middleware.dmp"
echo "geschrieben: $here/middleware.dmp ($(du -h "$here/middleware.dmp" | cut -f1))"
