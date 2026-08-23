#!/usr/bin/env bash
# ============================================================================
# ibm-provision-sync - Provisionierung der IBM-Anlagen auf s1 abschliessen
#
# Laeuft als root jede Minute (ibm-provision-sync.timer) und erledigt, was
# die Website im Docker-Container nicht selbst darf:
#
#   1. WireGuard: die Peers aller Anlagen mit gemeldetem Public-Key aus der
#      Mittelware-DB in /etc/wireguard/wg0.conf schreiben (Basis:
#      wg0.base.conf mit dem [Interface]-Block) und per `wg syncconf` live
#      nachladen - bestehende Tunnel bleiben verbunden. Die DB ist die
#      Registry; wg_synced_at wird gestempelt.
#   2. openHAB-Cloud: fuer Anlagen mit cloud_account_state pending|reset das
#      Konto im Cloud-Container anlegen bzw. das Passwort setzen
#      (cloud-makeuser.js per `docker compose exec`), danach created|error;
#      fuer cloud_account_state = delete das Konto loeschen.
#   3. Loeschen: Anlagen mit setup_phase = 'geloescht' (Dashboard "Anlage
#      loeschen") verlieren ihren Peer (Schritt 1 laesst sie weg), ihr
#      Cloud-Konto (Schritt 2) und werden danach aus der DB entfernt.
#
# Konfiguration: /etc/ibm-provision.conf (siehe setup-on-s1.sh).
# Log: journalctl -u ibm-provision-sync
# ============================================================================
set -euo pipefail

CONF="${IBM_PROVISION_CONF:-/etc/ibm-provision.conf}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"

DB_NAME="${DB_NAME:-ischlstrom_middleware}"
WEBSITE_ENV="${WEBSITE_ENV:-/home/martin/Container/ischlstrom/website/.env}"
CLOUD_COMPOSE_DIR="${CLOUD_COMPOSE_DIR:-/home/martin/openhab-cloud/deployment/docker-compose}"
CLOUD_SERVICE="${CLOUD_SERVICE:-app}"
WG_IF="${WG_IF:-wg0}"
WG_BASE="${WG_BASE:-/etc/wireguard/${WG_IF}.base.conf}"
WG_CONF="/etc/wireguard/${WG_IF}.conf"
MAKEUSER="${MAKEUSER:-/usr/local/lib/ibm-provision/cloud-makeuser.js}"

log() { echo "[ibm-provision] $*"; }

psql_db() {
  runuser -u postgres -- psql -d "$DB_NAME" -qAt -F $'\t' -v ON_ERROR_STOP=1 "$@"
}

sql_quote() { printf "'%s'" "${1//\'/\'\'}"; }

# --- 1. WireGuard -------------------------------------------------------------
sync_wireguard() {
  if [ ! -f "$WG_BASE" ]; then
    log "WireGuard: $WG_BASE fehlt - uebersprungen (install-on-s1.sh vom Entwicklungsrechner ausfuehren)."
    return 0
  fi

  local tmp peers
  tmp="$(mktemp)"
  cat "$WG_BASE" > "$tmp"
  peers="$(psql_db -c "SELECT s.id, s.name, s.wg_address, s.wg_public_key
                         FROM members_openhabstatus s
                        WHERE s.wg_public_key <> '' AND s.wg_address <> ''
                          AND s.setup_phase <> 'geloescht'
                        ORDER BY s.wg_address")"
  while IFS=$'\t' read -r id name addr pub; do
    [ -n "$id" ] || continue
    case "$pub" in *[!A-Za-z0-9+/=]*) log "WireGuard: Public-Key von Anlage $id unplausibel - uebersprungen."; continue ;; esac
    printf '\n[Peer]\n# %s - %s (Anlage %s, aus der DB)\nPublicKey  = %s\nAllowedIPs = %s/32\n' \
      "$name" "$addr" "$id" "$pub" "$addr" >> "$tmp"
  done <<< "$peers"

  # Sicherung: nie mit weniger Peers schreiben als bisher aktiv sind. Ein
  # Peer verschwindet nur, wenn die Anlage am Dashboard geloescht wurde -
  # dann liegt /etc/wireguard/ibm-allow-fewer-peers daneben (legt das
  # Dashboard-Loeschen nicht an; von Hand: sudo touch ..., gilt einmal).
  # Hintergrund: beim ersten Rollout 2026-08-23 waren die Bestandsanlagen
  # noch nicht in der DB, und die wg0.conf wurde ohne Peers geschrieben.
  # Ausnahme: Peers von Anlagen, die am Dashboard geloescht wurden
  # (setup_phase = 'geloescht'), duerfen verschwinden.
  local allow="/etc/wireguard/ibm-allow-fewer-peers" removed key ok_removed
  removed="$( { [ -f "$WG_CONF" ] && sed -n 's/^[[:space:]]*PublicKey[[:space:]]*=[[:space:]]*//p' "$WG_CONF"; } | sort -u \
             | comm -23 - <(sed -n 's/^[[:space:]]*PublicKey[[:space:]]*=[[:space:]]*//p' "$tmp" | sort -u) )"
  if [ -n "$removed" ] && [ ! -f "$allow" ]; then
    ok_removed=1
    while read -r key; do
      [ -n "$key" ] || continue
      [ "$(psql_db -c "SELECT count(*) FROM members_openhabstatus
                        WHERE wg_public_key = $(sql_quote "$key") AND setup_phase = 'geloescht'")" -gt 0 ] \
        || ok_removed=0
    done <<< "$removed"
    if [ "$ok_removed" != "1" ]; then
      log "WireGuard: neue wg0.conf wuerde Peers entfernen, die nicht zum Loeschen vorgemerkt sind - NICHT geschrieben (DB unvollstaendig? sonst: touch $allow)."
      rm -f "$tmp"
      return 0
    fi
  fi
  rm -f "$allow"

  if [ -f "$WG_CONF" ] && cmp -s "$tmp" "$WG_CONF"; then
    rm -f "$tmp"
  else
    install -m 0600 "$tmp" "$WG_CONF"
    rm -f "$tmp"
    if wg show "$WG_IF" >/dev/null 2>&1; then
      wg syncconf "$WG_IF" <(wg-quick strip "$WG_IF")
      log "WireGuard: $WG_CONF neu geschrieben und nachgeladen."
    else
      systemctl start "wg-quick@${WG_IF}" && log "WireGuard: Tunnel gestartet." \
        || log "WireGuard: wg-quick@${WG_IF} konnte nicht gestartet werden."
    fi
  fi

  psql_db -c "UPDATE members_openhabstatus SET wg_synced_at = now()
               WHERE wg_public_key <> '' AND wg_address <> '' AND wg_synced_at IS NULL" >/dev/null
}

# --- 2. openHAB-Cloud-Konten ------------------------------------------------
sync_cloud_accounts() {
  local pending
  pending="$(psql_db -c "SELECT id FROM members_openhabstatus
                          WHERE cloud_account_state IN ('pending','reset')
                            AND cloud_username <> '' AND cloud_uuid <> ''
                          ORDER BY id")"
  [ -n "$pending" ] || return 0

  local key
  key="$(sed -n 's/^IBM_SECRET_KEY="\{0,1\}\([0-9A-Fa-f]\{64\}\)"\{0,1\}.*/\1/p' "$WEBSITE_ENV" | head -n1)"
  if [ -z "$key" ]; then
    log "Cloud: IBM_SECRET_KEY nicht in $WEBSITE_ENV gefunden - Konten uebersprungen."
    return 0
  fi
  if [ ! -f "$MAKEUSER" ]; then
    log "Cloud: $MAKEUSER fehlt - Konten uebersprungen."
    return 0
  fi
  if [ ! -d "$CLOUD_COMPOSE_DIR" ]; then
    log "Cloud: $CLOUD_COMPOSE_DIR fehlt - Konten uebersprungen."
    return 0
  fi

  local id row username pw uuid secret result ok err
  for id in $pending; do
    row="$(psql_db -c "SELECT cloud_username, cloud_password, cloud_uuid, cloud_secret
                         FROM members_openhabstatus WHERE id = $id")"
    IFS=$'\t' read -r username pw uuid secret <<< "$row"

    result="$( cd "$CLOUD_COMPOSE_DIR" && docker compose exec -T \
                 -e IBM_USERNAME="$username" -e IBM_PASSWORD_ENC="$pw" \
                 -e IBM_UUID="$uuid" -e IBM_SECRET_ENC="$secret" -e IBM_SECRET_KEY="$key" \
                 "$CLOUD_SERVICE" node - < "$MAKEUSER" 2>&1 || true )"
    # Das Skript gibt genau eine JSON-Zeile aus; Mongo/Logger-Zeilen davor
    # und danach werden ignoriert.
    ok="$(printf '%s\n' "$result" | grep -E '^\{"ok":true' | tail -n1 || true)"
    if [ -n "$ok" ]; then
      psql_db -c "UPDATE members_openhabstatus
                     SET cloud_account_state = 'created', cloud_account_error = ''
                   WHERE id = $id" >/dev/null
      log "Cloud: Konto $username bereit ($ok)."
    else
      err="$(printf '%s\n' "$result" | grep -E '^\{"ok":false' | tail -n1 || true)"
      [ -n "$err" ] || err="$(printf '%s\n' "$result" | tail -n3 | tr '\n' ' ')"
      psql_db -c "UPDATE members_openhabstatus
                     SET cloud_account_state = 'error', cloud_account_error = $(sql_quote "${err:0:500}")
                   WHERE id = $id" >/dev/null
      log "Cloud: Konto $username FEHLER: $err"
    fi
  done
}

# --- 3. Loeschungen abschliessen ---------------------------------------------
delete_cloud_accounts() {
  local todo id username result
  todo="$(psql_db -c "SELECT id FROM members_openhabstatus WHERE cloud_account_state = 'delete' ORDER BY id")"
  [ -n "$todo" ] || return 0
  for id in $todo; do
    username="$(psql_db -c "SELECT cloud_username FROM members_openhabstatus WHERE id = $id")"
    if [ -z "$username" ] || [ ! -f "$MAKEUSER" ] || [ ! -d "$CLOUD_COMPOSE_DIR" ]; then
      psql_db -c "UPDATE members_openhabstatus SET cloud_account_state = '' WHERE id = $id" >/dev/null
      continue
    fi
    result="$( cd "$CLOUD_COMPOSE_DIR" && docker compose exec -T -e IBM_MODE=delete \
                 -e IBM_USERNAME="$username" "$CLOUD_SERVICE" node - < "$MAKEUSER" 2>&1 || true )"
    if printf '%s\n' "$result" | grep -qE '^\{"ok":true'; then
      psql_db -c "UPDATE members_openhabstatus SET cloud_account_state = '', cloud_account_error = '' WHERE id = $id" >/dev/null
      log "Cloud: Konto $username geloescht."
    else
      psql_db -c "UPDATE members_openhabstatus
                     SET cloud_account_error = $(sql_quote "Loeschen: ${result: -300}")
                   WHERE id = $id" >/dev/null
      log "Cloud: Konto $username konnte nicht geloescht werden: ${result: -200}"
    fi
  done
}

finalize_deletions() {
  # Zeile loeschen, sobald Peer (nicht mehr in wg0.conf) und Cloud-Konto weg sind.
  local todo id key
  todo="$(psql_db -c "SELECT id FROM members_openhabstatus
                       WHERE setup_phase = 'geloescht' AND cloud_account_state <> 'delete'
                       ORDER BY id")"
  [ -n "$todo" ] || return 0
  for id in $todo; do
    key="$(psql_db -c "SELECT wg_public_key FROM members_openhabstatus WHERE id = $id")"
    if [ -n "$key" ] && [ -f "$WG_CONF" ] && grep -qF "$key" "$WG_CONF"; then
      log "Loeschen: Anlage $id wartet noch auf das Entfernen des Peers."
      continue
    fi
    psql_db -c "DELETE FROM members_openhabstatus WHERE id = $id" >/dev/null
    log "Loeschen: Anlage $id aus der DB entfernt."
  done
}

sync_wireguard
sync_cloud_accounts
delete_cloud_accounts
finalize_deletions
