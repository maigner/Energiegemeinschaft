#!/usr/bin/env bash
# ============================================================================
# 05 - Overview-Seite: schreibt die IBM-Uebersichtsseite per REST API in die
# Main UI.
#
# Main-UI-Seiten liegen in der JSONDB, nicht in Konfigurationsdateien -
# deshalb geht das nur ueber die REST API und braucht ein API-Token eines
# Admin-Benutzers (OH_API_TOKEN in ibm.conf).
#
# Die Seite liegt als overview.page.json im Wechselrichter-Profil; erzeugt
# wird sie von build-dist.sh aus der dort gepflegten overview.yaml. Eine
# bestehende Overview-Seite wird vorher nach /var/lib/openhab/ibm/ gesichert.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

if [ "$INSTALL_OVERVIEW" != "1" ]; then
  log "INSTALL_OVERVIEW=0 - Overview-Seite uebersprungen."
  exit 0
fi

if [ -z "$OH_API_TOKEN" ]; then
  warn "OH_API_TOKEN fehlt in ibm.conf - Overview-Seite uebersprungen."
  warn "Nachruesten: Token eintragen und dieses Skript erneut ausfuehren."
  exit 0
fi

src="$IBM_INVERTER_DIR/$INVERTER_TYPE/overview.page.json"
[ -f "$src" ] || die "Overview-Seite fehlt: $src - Paket mit aktuellem build-dist.sh neu bauen oder Seite manuell einspielen (siehe README)."

api="http://127.0.0.1:8080/rest/ui/components/ui%3Apage"

# Anlagenspezifisches Ladestands-Item eintragen
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed "s/${INVERTER_SOC_PLACEHOLDER}/${SOC_ITEM}/g" "$src" > "$tmp"

# Bestehende Seite sichern (die Standardseite der Main UI liegt nicht in der
# JSONDB - dann antwortet die API mit 404 und es gibt nichts zu sichern).
state_dir="$OPENHAB_USERDATA/ibm"
mkdir -p "$state_dir"
backup="$state_dir/overview.page.bak-$(date +%Y%m%d%H%M%S).json"
code="$(curl -s -o "$backup" -w '%{http_code}' -m 10 \
  -H "Authorization: Bearer $OH_API_TOKEN" "$api/overview" || true)"

case "$code" in
  200)
    log "Bestehende Overview-Seite gesichert: $backup"
    method="PUT"; url="$api/overview"
    ;;
  404)
    rm -f "$backup"
    log "Noch keine gespeicherte Overview-Seite - wird neu angelegt."
    method="POST"; url="$api"
    ;;
  401|403)
    rm -f "$backup"
    die "API-Token wird abgelehnt (HTTP $code) - Token eines Admin-Benutzers in ibm.conf eintragen."
    ;;
  *)
    rm -f "$backup"
    die "openHAB REST API nicht erreichbar (HTTP $code) - laeuft openHAB?"
    ;;
esac

code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X "$method" \
  -H "Authorization: Bearer $OH_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @"$tmp" "$url" || true)"

case "$code" in
  200|201) log "Overview-Seite installiert (HTTP $code)." ;;
  *)       die "Overview-Seite konnte nicht geschrieben werden (HTTP $code)." ;;
esac

log "Anzeigen: Main UI -> Startseite (http://<pi>:8080)."
