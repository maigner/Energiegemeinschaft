#!/bin/bash
# Legt auf s1.ischlstrom.org die Rollen und Datenbanken der Website an
# (ischlstrom_middleware, ischlstrom_authjs_website). Idempotent - bestehende
# Rollen/Datenbanken bleiben, nur die Passwoerter werden neu gesetzt.
#
# Die Passwoerter kommen aus website/.env (dort stehen sie ohnehin schon);
# ausgefuehrt wird per ssh als postgres-Superuser auf s1.
# Voraussetzungen auf s1: PostgreSQL installiert (apt install postgresql),
# SSH-Benutzer mit sudo.
#
#   ./setup-s1-postgres.sh
#   S1=benutzer@s1.ischlstrom.org ./setup-s1-postgres.sh   # anderer Benutzer
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"

env_file="$here/../website/.env"
[ -f "$env_file" ] || { echo "FEHLER: $env_file fehlt." >&2; exit 1; }
# shellcheck disable=SC1090
. "$env_file"
: "${MIDDLEWARE_DB_PASSWORD:?fehlt in website/.env}"
: "${AUTHJS_DB_PASSWORD:?fehlt in website/.env}"

# Einfache Anfuehrungszeichen fuer SQL-Literale verdoppeln
sql_escape() { printf %s "$1" | sed "s/'/''/g"; }
mw_pwd="$(sql_escape "$MIDDLEWARE_DB_PASSWORD")"
aj_pwd="$(sql_escape "$AUTHJS_DB_PASSWORD")"

echo "Lege Rollen und Datenbanken auf $S1 an ..."

ssh "$S1" 'sudo -u postgres psql -v ON_ERROR_STOP=1' <<SQL
SELECT 'CREATE ROLE ischlstrom_middleware LOGIN'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ischlstrom_middleware')\gexec
ALTER ROLE ischlstrom_middleware WITH LOGIN PASSWORD '${mw_pwd}';

SELECT 'CREATE ROLE ischlstrom_authjs_website LOGIN'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ischlstrom_authjs_website')\gexec
ALTER ROLE ischlstrom_authjs_website WITH LOGIN PASSWORD '${aj_pwd}';

SELECT 'CREATE DATABASE ischlstrom_middleware OWNER ischlstrom_middleware'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ischlstrom_middleware')\gexec
SELECT 'CREATE DATABASE ischlstrom_authjs_website OWNER ischlstrom_authjs_website'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ischlstrom_authjs_website')\gexec

-- Zeitzone wie auf dem Heimserver - mehrere Abfragen/Views rechnen mit
-- lokaler Zeit (siehe CLAUDE.md: Europe/Vienna ueberall).
ALTER DATABASE ischlstrom_middleware SET timezone TO 'Europe/Vienna';
ALTER DATABASE ischlstrom_authjs_website SET timezone TO 'Europe/Vienna';
SQL

echo "Fertig. Naechster Schritt: export-server-db-*.sh, dann restore-s1-db-*.sh"
