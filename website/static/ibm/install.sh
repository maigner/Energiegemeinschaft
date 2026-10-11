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
#
# Signatur: das Paket ist mit minisign signiert (ibm-openhab.tgz.minisig,
# Schluessel setup/ibm-release.pub im Paket). Liegt auf dem Pi schon eine
# Installation mit diesem Schluessel, prueft der Bootstrap die Signatur
# damit und bricht bei Abweichung ab. Bei der ersten Installation gibt es
# noch keinen Schluessel am Pi - sie vertraut TLS und ischlstrom.org, ab
# dem ersten Update prueft der Pi dann selbst (ibm-update, siehe
# 09-install-updater.sh). Das eigentliche Einspielen macht
# setup/install-package.sh aus dem Paket.
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
SIGNATURE_URL="${TARBALL_URL}.minisig"
PUBKEY="$DEST/openhab/setup/ibm-release.pub"

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
  ( cd "$tmp" && sha256sum ibm-openhab.tgz > ibm-openhab.tgz.sha256 )
fi

# --- Signatur (nur pruefbar, wenn der Pi den Schluessel schon hat) -----------
if [ -f "$PUBKEY" ]; then
  if ! command -v minisign >/dev/null 2>&1; then
    log "Installiere minisign (apt-get) ..."
    apt-get install -y -qq -o DPkg::Lock::Timeout=120 minisign >/dev/null 2>&1 \
      || die "minisign fehlt und liess sich nicht installieren - Signatur nicht pruefbar, Abbruch. Nachinstallieren mit: apt-get install -y minisign"
  fi
  log "Lade Signatur: $SIGNATURE_URL"
  curl -fsSL -o "$tmp/ibm-openhab.tgz.minisig" "$SIGNATURE_URL" \
    || die "Signatur nicht abrufbar ($SIGNATURE_URL) - Paket wird nicht eingespielt."
  if minisign -Vq -p "$PUBKEY" -m "$tmp/ibm-openhab.tgz" -x "$tmp/ibm-openhab.tgz.minisig"; then
    log "Signatur OK (Schluessel: $PUBKEY)."
  else
    die "Signatur UNGUELTIG - das Paket stammt nicht vom Release-Schluessel. Nichts eingespielt."
  fi
else
  log "Erste Installation: noch kein Release-Schluessel am Pi, Signatur wird ab dem ersten Update geprueft."
fi

# --- Entpacken und einspielen -----------------------------------------------
mkdir -p "$tmp/pkg"
tar -xzf "$tmp/ibm-openhab.tgz" -C "$tmp/pkg"
[ -x "$tmp/pkg/openhab/setup/install-package.sh" ] || chmod +x "$tmp/pkg/openhab/setup/install-package.sh" 2>/dev/null \
  || die "Paket unerwartet aufgebaut - setup/install-package.sh fehlt."

# install-package.sh ersetzt diesen Prozess (exec), der EXIT-Trap liefe nie;
# deshalb raeumt es das Download-Verzeichnis selbst weg (--cleanup), sobald
# das Paket an Ort und Stelle ist. (Ohne das blieb das Verzeichnis, 27 MB,
# bei jedem Lauf in /tmp liegen - tmpfs, am 2026-09-16 auf pi-223 voll.)
trap - EXIT
exec bash "$tmp/pkg/openhab/setup/install-package.sh" \
  --from "$tmp/pkg/openhab" --sha256 "$tmp/ibm-openhab.tgz.sha256" --dest "$DEST" --cleanup "$tmp"
