#!/bin/bash
# Frischer Dump der Middleware-DB vom Heimserver ("server").
# Passwort kommt aus notebooks/.pgpass (Host "server" muss dort stehen).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PGPASSFILE="$here/../notebooks/.pgpass"

# --no-owner/--no-privileges: die Objekte gehoeren nach dem Restore einfach
# dem einspielenden Benutzer - ALTER OWNER/GRANT aus dem Dump wuerden auf s1
# an fehlenden Rollenrechten scheitern ("must be able to SET ROLE").
pg_dump --no-owner --no-privileges \
    "host=server user=ischlstrom_middleware dbname=ischlstrom_middleware sslmode=require" \
    > "$here/middleware.dmp"
echo "geschrieben: $here/middleware.dmp ($(du -h "$here/middleware.dmp" | cut -f1))"
