#!/usr/bin/env bash
# ============================================================================
# 05 - Main-UI-Seiten: schreibt die IBM-Seiten (Overview + Unterseiten) per
# REST API in die Main UI.
#
# Main-UI-Seiten liegen in der JSONDB, nicht in Konfigurationsdateien -
# deshalb geht das nur ueber die REST API und braucht ein API-Token eines
# Admin-Benutzers (OH_API_TOKEN in ibm.conf).
#
# Die Seiten liegen als page-<uid>.json im Wechselrichter-Profil; erzeugt
# werden sie von build-dist.sh aus der dort gepflegten overview.yaml. Eine
# bestehende Seite wird vorher nach /var/lib/openhab/ibm/ gesichert.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

if [ "$INSTALL_OVERVIEW" != "1" ]; then
  log "INSTALL_OVERVIEW=0 - Main-UI-Seiten uebersprungen."
  exit 0
fi

if [ "$OH_API_TOKEN" = "auto" ]; then
  ensure_api_token || true
fi
if [ -z "$OH_API_TOKEN" ] || [ "$OH_API_TOKEN" = "auto" ]; then
  warn "Kein brauchbares OH_API_TOKEN in ibm.conf - Main-UI-Seiten uebersprungen."
  warn "Nachruesten: Token eintragen und dieses Skript erneut ausfuehren."
  exit 0
fi

shopt -s nullglob
pages=("$IBM_INVERTER_DIR/$INVERTER_TYPE"/page-*.json)
[ "${#pages[@]}" -gt 0 ] || die "Keine Seiten gefunden ($IBM_INVERTER_DIR/$INVERTER_TYPE/page-*.json) - Paket mit aktuellem build-dist.sh neu bauen oder Seiten manuell einspielen (siehe README)."

api="http://127.0.0.1:8080/rest/ui/components/ui%3Apage"
state_dir="$OPENHAB_USERDATA/ibm"
mkdir -p "$state_dir"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

for src in "${pages[@]}"; do
  uid="$(basename "$src")"
  uid="${uid#page-}"
  uid="${uid%.json}"

  # Anlagenspezifische Items eintragen. BATTERY_POWER_ITEM ist optional -
  # ohne Wert bleibt der Platzhalter stehen (er ist zugleich der
  # Standard-Itemname beim Verknuepfen des Channels).
  # Begruessung der Kopfzeile: mit Vornamen (Provisionierung bzw. ibm.conf)
  # "Hallo <Vorname>", sonst wie die Standard-Navbar "Uebersicht".
  greeting="Übersicht"
  [ -n "${IBM_MEMBER_FIRSTNAME:-}" ] && greeting="Hallo ${IBM_MEMBER_FIRSTNAME}"
  sed_script="s/${INVERTER_SOC_PLACEHOLDER}/${SOC_ITEM}/g;s/HALLOIBMGREETING/${greeting}/g"
  if [ -n "$INVERTER_BATTERY_POWER_PLACEHOLDER" ] && [ -n "$BATTERY_POWER_ITEM" ]; then
    sed_script="${sed_script};s/${INVERTER_BATTERY_POWER_PLACEHOLDER}/${BATTERY_POWER_ITEM}/g"
  fi
  sed "$sed_script" "$src" > "$tmp"

  # Sidebar-Label der Home-Seite: mit Vornamen "Hallo <Name>". Der grosse
  # Seitentitel kommt NICHT von hier (fest "Uebersicht" in der Main UI);
  # den ersetzt die Kopfzeile der Overview-Seite (HALLOIBMGREETING oben).
  if [ "$uid" = "home" ] && [ -n "${IBM_MEMBER_FIRSTNAME:-}" ]; then
    IBM_OV_FILE="$tmp" IBM_OV_LABEL="Hallo ${IBM_MEMBER_FIRSTNAME}" python3 - <<'PY'
import json, os
path = os.environ["IBM_OV_FILE"]
with open(path) as f:
    page = json.load(f)
page.setdefault("config", {})["label"] = os.environ["IBM_OV_LABEL"]
with open(path, "w") as f:
    json.dump(page, f, ensure_ascii=False, indent=2)
PY
  fi

  # Bestehende Seite sichern (eine nie gespeicherte Seite liegt nicht in der
  # JSONDB - dann antwortet die API mit 404 und es gibt nichts zu sichern).
  backup="$state_dir/${uid}.page.bak-$(date +%Y%m%d%H%M%S).json"
  code="$(curl -s -o "$backup" -w '%{http_code}' -m 10 \
    -H "Authorization: Bearer $OH_API_TOKEN" "$api/$uid" || true)"

  case "$code" in
    200)
      log "Bestehende Seite '$uid' gesichert: $backup"
      method="PUT"; url="$api/$uid"
      ;;
    404)
      rm -f "$backup"
      log "Seite '$uid' noch nicht vorhanden - wird neu angelegt."
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
    200|201) log "Seite '$uid' installiert (HTTP $code)." ;;
    *)       die "Seite '$uid' konnte nicht geschrieben werden (HTTP $code)." ;;
  esac
done

log "${#pages[@]} Seiten installiert."
log "Anzeigen: Main UI -> Startseite (http://<pi>:8080)."
