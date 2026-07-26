#!/usr/bin/env bash
# ============================================================================
# Packt die IBM-Skripte fuer die Auslieferung ueber ischlstrom.org.
#
# Erzeugt in website/static/ibm/:
#   ibm-openhab.tar.gz          das Paket
#   ibm-openhab.tar.gz.sha256   Pruefsumme (vom Bootstrap verifiziert)
#
# Auf dem Entwicklungsrechner ausfuehren, VOR website/deploy-server.sh:
#   ./build-dist.sh && ../../../website/deploy-server.sh
# ============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
openhab_dir="$(cd "$here/.." && pwd)"          # Batteriemanagement/openhab
repo_root="$(cd "$openhab_dir/../.." && pwd)"  # Repository-Wurzel
dist_dir="$repo_root/website/static/ibm"

tarball="$dist_dir/ibm-openhab.tar.gz"
checksum="$tarball.sha256"

log() { echo "[IBM] $*"; }
die() { echo "[IBM] FEHLER: $*" >&2; exit 1; }

[ -d "$repo_root/website/static" ] || die "website/static nicht gefunden - Repository-Wurzel falsch erkannt: $repo_root"
[ -f "$openhab_dir/setup/install-ibm.sh" ] || die "setup/install-ibm.sh nicht gefunden in $openhab_dir"

mkdir -p "$dist_dir"

# Build-Information mit ins Paket, damit auf dem Pi nachvollziehbar ist,
# welcher Stand installiert wurde.
build_info="$openhab_dir/BUILD-INFO"
{
  echo "gebaut am: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "gebaut auf: $(hostname)"
  if command -v git >/dev/null 2>&1 && [ -d "$repo_root/.git" ]; then
    echo "commit: $(git -C "$repo_root" rev-parse --short HEAD 2>/dev/null || echo unbekannt)"
  fi
} > "$build_info"

log "Packe $openhab_dir ..."
tar -czf "$tarball" \
    -C "$(dirname "$openhab_dir")" \
    --exclude='setup/ibm.conf' \
    --exclude='*.bak-*' \
    --exclude='.gitignore' \
    "$(basename "$openhab_dir")"

rm -f "$build_info"

( cd "$dist_dir" && sha256sum "$(basename "$tarball")" > "$(basename "$checksum")" )

log "erzeugt: $tarball ($(du -h "$tarball" | cut -f1))"
log "erzeugt: $checksum"
log ""
log "Inhalt:"
tar -tzf "$tarball" | sed 's/^/[IBM]   /'
log ""
log "Naechster Schritt: website/deploy-server.sh ausfuehren, damit"
log "https://ischlstrom.org/ibm/install.sh das neue Paket ausliefert."
