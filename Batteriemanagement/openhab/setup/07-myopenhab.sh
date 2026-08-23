#!/usr/bin/env bash
# ============================================================================
# 07 - openHAB Cloud: zeigt UUID und Secret fuer die Registrierung auf der
# ISCHLSTROM-Cloud (hac.ischlstrom.org) an. Aendert nichts an der Installation.
#
# Das Addon 'openhabcloud' traegt 02-install-addons.sh in addons.cfg ein.
# Beim ersten Start erzeugt es das Secret unter
#   /var/lib/openhab/openhabcloud/secret
# Die UUID der Installation legt openHAB selbst beim ersten Boot an:
#   /var/lib/openhab/uuid
# Dieses Skript wartet auf das Secret (die Addon-Installation kann einige
# Minuten dauern) und zeigt dann beide Werte samt Anleitung an.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
require_openhab
load_config

if [ "$INSTALL_CLOUD" != "1" ]; then
  log "INSTALL_CLOUD=0 - openHAB Cloud uebersprungen."
  exit 0
fi

uuid_file="$OPENHAB_USERDATA/uuid"
secret_file="$OPENHAB_USERDATA/openhabcloud/secret"

# --- Provisioniert: Identitaet vom Server setzen -----------------------------
# Bei der Zero-Touch-Einrichtung erzeugt der Server UUID und Secret und
# legt das Cloud-Konto schon vor dem ersten Boot an. openHAB liest die UUID
# nur beim Start (daher Neustart, wenn sie sich aendert); das Cloud-Addon
# legt das Secret nur an, wenn die Datei fehlt - unsere gilt also, sobald
# das Addon startet (02-install-addons.sh laeuft danach).
if [ -n "$CLOUD_UUID" ] && [ -n "$CLOUD_SECRET" ]; then
  changed=0
  current_uuid="$( [ -f "$uuid_file" ] && tr -d '[:space:]' < "$uuid_file" || true )"
  if [ "$current_uuid" != "$CLOUD_UUID" ]; then
    printf '%s' "$CLOUD_UUID" > "$uuid_file"
    chown "$OPENHAB_USER:$OPENHAB_GROUP" "$uuid_file"; chmod 600 "$uuid_file"
    log "openHAB-UUID gesetzt: $CLOUD_UUID (war: ${current_uuid:-keine})"
    changed=1
  else
    log "openHAB-UUID bereits $CLOUD_UUID."
  fi
  current_secret="$( [ -f "$secret_file" ] && tr -d '[:space:]' < "$secret_file" || true )"
  if [ "$current_secret" != "$CLOUD_SECRET" ]; then
    mkdir -p "$(dirname "$secret_file")"
    (umask 077; printf '%s' "$CLOUD_SECRET" > "$secret_file")
    chown -R "$OPENHAB_USER:$OPENHAB_GROUP" "$(dirname "$secret_file")"
    log "Cloud-Secret gesetzt."
    [ -n "$current_secret" ] && changed=1
  else
    log "Cloud-Secret bereits gesetzt."
  fi
  if [ "$changed" = "1" ] && systemctl is-active --quiet openhab.service 2>/dev/null; then
    openhab_restart
    wait_for_openhab_rest 600 || warn "openHAB antwortet nach dem Neustart noch nicht."
  fi
  log "Cloud-Identitaet gesetzt - das Konto ($IBM_CLOUD_BASE_URL) hat der Vorstand angelegt;"
  log "die Anlage erscheint dort als Online, sobald das Cloud-Addon laeuft."
  exit 0
fi

# --- UUID -------------------------------------------------------------------
[ -f "$uuid_file" ] || die "UUID-Datei fehlt: $uuid_file - openHAB schon einmal gestartet?"
uuid="$(tr -d '[:space:]' < "$uuid_file")"
[ -n "$uuid" ] || die "UUID-Datei ist leer: $uuid_file"

# --- Secret -----------------------------------------------------------------
# Entsteht erst, wenn das Cloud-Addon das erste Mal laeuft.
if [ ! -f "$secret_file" ]; then
  log "Warte auf das openHAB-Cloud-Secret ($secret_file) ..."
  log "Das Addon wird gerade installiert - das kann einige Minuten dauern."
  waited=0
  while [ ! -f "$secret_file" ] && [ "$waited" -lt 300 ]; do
    sleep 5
    waited=$((waited + 5))
  done
fi

if [ ! -f "$secret_file" ]; then
  warn "Secret nach 5 Minuten nicht gefunden: $secret_file"
  warn "Moegliche Ursachen:"
  warn "  - Addon noch nicht fertig installiert. Fortschritt beobachten:"
  warn "      tail -f $OPENHAB_LOGDIR/openhab.log"
  warn "  - Addons werden nicht ueber addons.cfg verwaltet (INSTALL_ADDONS=0)."
  warn "    Dann in der Main UI installieren: Settings -> Add-ons -> Misc"
  warn "    -> 'openHAB Cloud Connector'."
  warn "  - Addon installiert, aber noch nicht gestartet (das Secret entsteht"
  warn "    erst beim ersten Start). Dann hilft ein Neustart:"
  warn "      sudo systemctl restart openhab.service"
  warn "Danach dieses Skript erneut ausfuehren:"
  warn "  sudo $IBM_SETUP_DIR/07-myopenhab.sh"
  exit 1
fi

secret="$(tr -d '[:space:]' < "$secret_file")"
[ -n "$secret" ] || die "Secret-Datei ist leer: $secret_file"

cat <<ANLEITUNG
[IBM]
[IBM] ===========================================================
[IBM]  openHAB Cloud - Registrierung auf $IBM_CLOUD_BASE_URL
[IBM] ===========================================================
[IBM]
[IBM]   UUID   : ${uuid}
[IBM]   Secret : ${secret}
[IBM]
[IBM] So wird die Anlage registriert:
[IBM]   1. $IBM_CLOUD_BASE_URL aufrufen und ueber "Register" ein Konto
[IBM]      anlegen (E-Mail-Adresse und Passwort des Mitglieds).
[IBM]   2. Dabei die obige UUID und das Secret eintragen.
[IBM]      (Spaeter aenderbar unter Account.)
[IBM]   3. Kurz warten, bis die Cloud die Anlage als "Online" zeigt.
[IBM]      Verbindet sie sich nicht, openHAB einmal neu starten:
[IBM]        sudo systemctl restart openhab.service
[IBM]
[IBM] Danach ist die Main UI von unterwegs erreichbar:
[IBM]   https://remote.hac.ischlstrom.org   (Login mit dem Cloud-Konto)
[IBM]
ANLEITUNG
