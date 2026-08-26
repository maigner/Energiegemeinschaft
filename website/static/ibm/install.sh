#!/usr/bin/env bash
# ============================================================================
# ISCHLSTROM Batteriemanagement (IBM) - Bootstrap
#
# Laedt die Setup-Skripte herunter und startet den Einrichtungsassistenten.
# Gedacht fuer eine frisch geflashte openHABian-Installation.
#
#   curl -fsSL https://ischlstrom.org/ibm/install.sh -o install.sh
#   sudo bash install.sh
#
# Kurzform (funktioniert ebenfalls, die Abfragen lesen von /dev/tty):
#   curl -fsSL https://ischlstrom.org/ibm/install.sh | sudo bash
#
# Umgebungsvariablen:
#   IBM_BASE_URL     Quelle der Skripte     (Vorgabe: https://ischlstrom.org)
#   IBM_DEST         Zielverzeichnis        (Vorgabe: /opt/ischlstrom)
#   IBM_ASSUME_YES   1 = keine Rueckfragen, alle Vorgaben uebernehmen
#   IBM_PROVISION_CODE  Provisionierungs-Code (Zero-Touch-Einrichtung, siehe
#                    docs/ibm-setup-vereinfachung.md); wird sonst aus
#                    /boot/firmware/ibm-provision.conf gelesen. Mit Code gibt
#                    es keine Rueckfragen, alles kommt von ischlstrom.org.
# ============================================================================
set -euo pipefail

# Provisionierung von der Boot-Partition der SD-Karte (vom Vorstand mit
# "SD-Karte vorbereiten" erzeugt): nur Code und Server-URL.
for f in /boot/firmware/ibm-provision.conf /boot/ibm-provision.conf; do
  if [ -z "${IBM_PROVISION_CODE:-}" ] && [ -f "$f" ]; then
    # shellcheck disable=SC1090
    . "$f"
    echo "[IBM] Provisionierung gelesen: $f"
  fi
done
if [ -n "${IBM_PROVISION_CODE:-}" ]; then
  export IBM_PROVISION_CODE IBM_ASSUME_YES=1
  [ -n "${IBM_BASE_URL:-}" ] && export IBM_BASE_URL
fi

BASE_URL="${IBM_BASE_URL:-https://ischlstrom.org}"
DEST="${IBM_DEST:-/opt/ischlstrom}"
TARBALL_URL="${BASE_URL}/ibm/ibm-openhab.tgz"
CHECKSUM_URL="${TARBALL_URL}.sha256"

log()  { echo "[IBM] $*"; }
warn() { echo "[IBM] WARNUNG: $*" >&2; }
die()  { echo "[IBM] FEHLER: $*" >&2; exit 1; }

cat <<'KOPF'
[IBM]
[IBM] ===========================================================
[IBM]  ISCHLSTROM Batteriemanagement - Installation
[IBM] ===========================================================
[IBM]
KOPF

# --- Voraussetzungen --------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "Bitte mit sudo ausfuehren: sudo bash install.sh"

for cmd in curl tar sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' fehlt. Nachinstallieren mit: apt-get install -y $cmd"
done

[ -d "${OPENHAB_CONF:-/etc/openhab}" ] || die "${OPENHAB_CONF:-/etc/openhab} nicht gefunden. Dieses Skript gehoert auf den openHABian-Rechner, und openHAB muss installiert sein."

# --- Herunterladen ----------------------------------------------------------
tmp="$(mktemp -d)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

log "Lade Paket: $TARBALL_URL"
curl -fsSL -o "$tmp/ibm-openhab.tgz" "$TARBALL_URL" \
  || die "Download fehlgeschlagen. Internetverbindung pruefen: $TARBALL_URL"

log "Lade Pruefsumme: $CHECKSUM_URL"
if curl -fsSL -o "$tmp/ibm-openhab.tgz.sha256" "$CHECKSUM_URL"; then
  if ( cd "$tmp" && sha256sum -c ibm-openhab.tgz.sha256 >/dev/null 2>&1 ); then
    log "Pruefsumme OK."
  else
    die "Pruefsumme stimmt nicht. Download abgebrochen - bitte erneut versuchen."
  fi
else
  warn "Keine Pruefsumme abrufbar - Paket wird ungeprueft entpackt."
fi

# --- Entpacken --------------------------------------------------------------
if [ -d "$DEST/openhab" ]; then
  backup="$DEST/openhab.bak-$(date +%Y%m%d%H%M%S)"
  log "Bestehende Installation wird gesichert: $backup"
  mv "$DEST/openhab" "$backup"
  # Konfiguration der Anlage aus der Sicherung uebernehmen
  if [ -f "$backup/setup/ibm.conf" ]; then
    log "Bestehende ibm.conf wird uebernommen."
    keep_conf="$backup/setup/ibm.conf"
  fi
fi

mkdir -p "$DEST"
tar -xzf "$tmp/ibm-openhab.tgz" -C "$DEST"
[ -d "$DEST/openhab/setup" ] || die "Paket unerwartet aufgebaut - $DEST/openhab/setup fehlt."

if [ -n "${keep_conf:-}" ] && [ -f "$keep_conf" ]; then
  cp -a "$keep_conf" "$DEST/openhab/setup/ibm.conf"
fi
# Pruefsumme des installierten Pakets: der Selbst-Update-Timer (ibm-update)
# vergleicht sie naechtlich mit der auf dem Server.
if [ -f "$tmp/ibm-openhab.tgz.sha256" ]; then
  cp "$tmp/ibm-openhab.tgz.sha256" "$DEST/openhab/PACKAGE-SHA256"
else
  sha256sum "$tmp/ibm-openhab.tgz" | sed 's|  .*|  ibm-openhab.tgz|' > "$DEST/openhab/PACKAGE-SHA256"
fi

chmod +x "$DEST/openhab/setup"/*.sh "$DEST/openhab/setup/lib"/*.sh 2>/dev/null || true

log "Entpackt nach: $DEST/openhab"
[ -f "$DEST/openhab/BUILD-INFO" ] && sed 's/^/[IBM] /' "$DEST/openhab/BUILD-INFO"

# --- Einrichtung ------------------------------------------------------------
log ""
log "Starte Einrichtung ..."
log ""
exec "$DEST/openhab/setup/install-ibm.sh"
