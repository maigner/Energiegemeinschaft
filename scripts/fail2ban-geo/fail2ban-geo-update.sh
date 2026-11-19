#!/usr/bin/env bash
# ============================================================================
# fail2ban-geo-update - die DB-IP-Lite-Dateien (City + ASN, mmdb) laden
#
# Laeuft auf s1 als root (fail2ban-geo-update.timer, monatlich am 3.) und
# beim Einrichten. DB-IP veroeffentlicht die Lite-Datenbanken monatsweise
# unter CC BY 4.0, ohne Konto: https://db-ip.com/db/lite.php - die Seite
# /board/security nennt die Quelle. Geladen wird der laufende Monat, sonst
# der vorige; eine Datei wird erst nach bestandener Pruefung (Groesse,
# Nachschlagen einer bekannten Adresse) an ihren Platz geschoben, der
# 10-Minuten-Lauf sieht also nie eine halbe Datei.
#
#   fail2ban-geo-update.sh           laden, wenn der Monat noch fehlt
#   fail2ban-geo-update.sh --force   auf jeden Fall neu laden
#
# Log: journalctl -u fail2ban-geo-update
# ============================================================================
set -euo pipefail

GEO_DIR="${GEO_DIR:-/var/lib/fail2ban-geo}"
LIB="${F2BGEO_LIB:-/usr/local/lib/fail2ban-geo}"
BASE_URL="${DBIP_BASE_URL:-https://download.db-ip.com/free}"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

log() { echo "[fail2ban-geo-update] $*"; }

this_month="$(date +%Y-%m)"
prev_month="$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m)"
stamp="$GEO_DIR/month"

if [ "$FORCE" = 0 ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$this_month" ] \
   && [ -s "$GEO_DIR/dbip-city-lite.mmdb" ] && [ -s "$GEO_DIR/dbip-asn-lite.mmdb" ]; then
  log "Stand $this_month ist schon da."
  exit 0
fi

install -d -m 0755 "$GEO_DIR"
tmp="$(mktemp -d "$GEO_DIR/.new.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

got=""
for month in "$this_month" "$prev_month"; do
  ok=1
  for kind in city asn; do
    url="$BASE_URL/dbip-$kind-lite-$month.mmdb.gz"
    if ! curl -fsS --retry 3 --retry-delay 20 --max-time 600 -o "$tmp/dbip-$kind-lite.mmdb.gz" "$url"; then
      log "$url nicht ladbar."
      ok=0
      break
    fi
  done
  if [ "$ok" = 1 ]; then got="$month"; break; fi
done
[ -n "$got" ] || { log "FEHLER: weder $this_month noch $prev_month ladbar - die alten Dateien bleiben."; exit 1; }

gunzip "$tmp/dbip-city-lite.mmdb.gz" "$tmp/dbip-asn-lite.mmdb.gz"
# Plausibilitaet: City liegt bei gut 100 MB, ASN bei knapp 10 MB
[ "$(stat -c %s "$tmp/dbip-city-lite.mmdb")" -gt 30000000 ] || { log "FEHLER: City-Datei zu klein."; exit 1; }
[ "$(stat -c %s "$tmp/dbip-asn-lite.mmdb")" -gt 2000000 ] || { log "FEHLER: ASN-Datei zu klein."; exit 1; }
GEO_DIR="$tmp" python3 "$LIB/fail2ban_geo.py" --check-geo

chmod 0644 "$tmp"/dbip-*.mmdb
mv -f "$tmp/dbip-city-lite.mmdb" "$GEO_DIR/dbip-city-lite.mmdb"
mv -f "$tmp/dbip-asn-lite.mmdb" "$GEO_DIR/dbip-asn-lite.mmdb"
echo "$got" > "$stamp"
log "DB-IP Lite $got installiert."
