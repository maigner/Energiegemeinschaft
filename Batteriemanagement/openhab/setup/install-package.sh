#!/usr/bin/env bash
# ============================================================================
# Spielt ein bereits heruntergeladenes, entpacktes und geprueftes IBM-Paket
# ein und startet die Einrichtung. Gemeinsamer Schlussteil von
#   * ibm/install.sh   (Bootstrap von ischlstrom.org, erste Installation)
#   * ibm-update       (Selbst-Update, 09-install-updater.sh): laedt Paket
#                      und Signatur, prueft sie mit dem installierten
#                      ibm-release.pub und ruft dann DIESES Skript aus dem
#                      frisch entpackten Paket auf - der Updater fuehrt so
#                      nie Code aus, dessen Signatur er nicht geprueft hat.
#
#   install-package.sh --from <dir>/openhab --sha256 <datei> [--dest /opt/ischlstrom]
#
#   --from    das entpackte Paket (Verzeichnis "openhab" mit setup/, control/ ...)
#   --sha256  Datei im Format von sha256sum fuer das Paket (wird als
#             PACKAGE-SHA256 abgelegt; der naechtliche Vergleich des Updaters
#             liest sie)
#   --dest    Zielverzeichnis (Vorgabe /opt/ischlstrom bzw. $IBM_DEST)
#   --cleanup Download-Verzeichnis, das nach dem Einspielen geloescht wird
#             (das Skript selbst darf darin liegen - Bash haelt die Datei
#             offen; der Aufrufer ruft per exec, sein EXIT-Trap liefe nie)
#
# Ablauf: bestehende Installation sichern (die letzten drei Sicherungen
# bleiben), ibm.conf uebernehmen, Paket an Ort und Stelle schieben,
# install-ibm.sh starten (ersetzt diesen Prozess; Umgebungsvariablen wie
# IBM_ASSUME_YES, IBM_PROVISION_CODE, IBM_BASE_URL gehen durch).
# ============================================================================
set -euo pipefail

log()  { echo "[IBM] $*"; }
die()  { echo "[IBM] FEHLER: $*" >&2; exit 1; }

from=""; sha_file=""; dest="${IBM_DEST:-/opt/ischlstrom}"; cleanup_dir=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from)    from="${2:-}"; shift ;;
    --sha256)  sha_file="${2:-}"; shift ;;
    --dest)    dest="${2:-}"; shift ;;
    --cleanup) cleanup_dir="${2:-}"; shift ;;
    *) die "Unbekannte Option: $1" ;;
  esac
  shift
done
[ "$(id -u)" -eq 0 ] || die "Bitte als root ausfuehren."
[ -n "$from" ] && [ -d "$from/setup" ] || die "--from fehlt oder ist kein Paket (setup/ fehlt): ${from:-?}"
[ -n "$sha_file" ] && [ -f "$sha_file" ] || die "--sha256 fehlt: ${sha_file:-?}"
[ -d "${OPENHAB_CONF:-/etc/openhab}" ] || die "${OPENHAB_CONF:-/etc/openhab} nicht gefunden. Dieses Skript gehoert auf den openHABian-Rechner, und openHAB muss installiert sein."

# --- Sichern ------------------------------------------------------------------
keep_conf=""
if [ -d "$dest/openhab" ]; then
  backup="$dest/openhab.bak-$(date +%Y%m%d%H%M%S)"
  log "Bestehende Installation wird gesichert: $backup"
  mv "$dest/openhab" "$backup"
  if [ -f "$backup/setup/ibm.conf" ]; then
    log "Bestehende ibm.conf wird uebernommen."
    keep_conf="$backup/setup/ibm.conf"
  fi
fi

# --- Einspielen ---------------------------------------------------------------
mkdir -p "$dest"
# mv statt cp: das Paket liegt im Normalfall auf demselben Dateisystem
# (/run ist tmpfs - dann kopiert mv); so oder so liegt danach nichts mehr
# im Download-Verzeichnis.
mv "$from" "$dest/openhab"
[ -d "$dest/openhab/setup" ] || die "Paket unerwartet aufgebaut - $dest/openhab/setup fehlt."

if [ -n "$keep_conf" ] && [ -f "$keep_conf" ]; then
  cp -a "$keep_conf" "$dest/openhab/setup/ibm.conf"
fi
# Nur die letzten drei Sicherungen behalten, sonst fuellt sich die SD-Karte.
# Hier, damit es fuer jeden Weg gilt: ibm-update, die ibm-firstboot-Schleife
# (alle 10 Minuten, solange die Einrichtung unvollstaendig ist - pi-223
# hatte so 2200 Sicherungen) und den Aufruf von Hand.
ls -dt "$dest"/openhab.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf

# Pruefsumme des installierten Pakets: der Selbst-Update-Timer (ibm-update)
# vergleicht sie naechtlich mit der auf dem Server.
sed 's|  .*|  ibm-openhab.tgz|' "$sha_file" > "$dest/openhab/PACKAGE-SHA256"

chmod +x "$dest/openhab/setup"/*.sh "$dest/openhab/setup/lib"/*.sh 2>/dev/null || true

if [ -n "$cleanup_dir" ] && [ -d "$cleanup_dir" ]; then
  case "$cleanup_dir" in
    /tmp/*|/run/*|/var/tmp/*) rm -rf "$cleanup_dir" ;;
    *) log "Download-Verzeichnis nicht geloescht (unerwarteter Ort): $cleanup_dir" ;;
  esac
fi

log "Eingespielt nach: $dest/openhab"
[ -f "$dest/openhab/BUILD-INFO" ] && sed 's/^/[IBM] /' "$dest/openhab/BUILD-INFO"

# --- Einrichtung --------------------------------------------------------------
log ""
log "Starte Einrichtung ..."
log ""
exec "$dest/openhab/setup/install-ibm.sh"
