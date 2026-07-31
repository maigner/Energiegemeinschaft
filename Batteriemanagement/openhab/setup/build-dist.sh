#!/usr/bin/env bash
# ============================================================================
# Packt die IBM-Skripte fuer die Auslieferung ueber ischlstrom.org.
#
# Erzeugt in website/static/ibm/:
#   ibm-openhab.tgz          das Paket
#   ibm-openhab.tgz.sha256   Pruefsumme (vom Bootstrap verifiziert)
#
# Endung .tgz statt .tar.gz: sirv (adapter-node) liefert *.gz-Dateien mit
# "Content-Encoding: gzip" aus - Clients ohne Accept-Encoding bekommen dann
# das entpackte Tar und die Pruefsumme schlaegt fehl.
#
# Auf dem Entwicklungsrechner ausfuehren, VOR website/deploy-server.sh:
#   ./build-dist.sh && ../../../website/deploy-server.sh
# ============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
openhab_dir="$(cd "$here/.." && pwd)"          # Batteriemanagement/openhab
repo_root="$(cd "$openhab_dir/../.." && pwd)"  # Repository-Wurzel
dist_dir="$repo_root/website/static/ibm"

tarball="$dist_dir/ibm-openhab.tgz"
checksum="$tarball.sha256"

log() { echo "[IBM] $*"; }
die() { echo "[IBM] FEHLER: $*" >&2; exit 1; }

[ -d "$repo_root/website/static" ] || die "website/static nicht gefunden - Repository-Wurzel falsch erkannt: $repo_root"
[ -f "$openhab_dir/setup/install-ibm.sh" ] || die "setup/install-ibm.sh nicht gefunden in $openhab_dir"

command -v python3 >/dev/null 2>&1 || die "python3 fehlt (wird fuer die Overview-Konvertierung gebraucht)."
python3 -c 'import yaml' 2>/dev/null || die "PyYAML fehlt: sudo apt install python3-yaml"

mkdir -p "$dist_dir"

# Main-UI-Seiten der Profile in das REST-Format wandeln - die Main UI
# speichert Seiten in der JSONDB, 05-install-overview.sh schreibt sie daher
# per REST API und braucht jede Seite als page-<uid>.json.
generated_pages=()
for ov in "$openhab_dir"/inverters/*/overview.yaml; do
  [ -f "$ov" ] || continue
  dir="$(dirname "$ov")"
  python3 - "$ov" "$dir" <<'PY' || die "Seiten-Konvertierung fehlgeschlagen: $ov"
import json, os, sys, yaml
src, dstdir = sys.argv[1], sys.argv[2]
with open(src) as f:
    data = yaml.safe_load(f)
for uid, page in data["pages"].items():
    with open(os.path.join(dstdir, "page-" + uid + ".json"), "w") as f:
        json.dump({"uid": uid, **page}, f, ensure_ascii=False, indent=2)
PY
  for p in "$dir"/page-*.json; do
    generated_pages+=("$p")
    log "erzeugt: $p"
  done
done

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
[ "${#generated_pages[@]}" -gt 0 ] && rm -f "${generated_pages[@]}"

( cd "$dist_dir" && sha256sum "$(basename "$tarball")" > "$(basename "$checksum")" )

log "erzeugt: $tarball ($(du -h "$tarball" | cut -f1))"
log "erzeugt: $checksum"
log ""
log "Inhalt:"
tar -tzf "$tarball" | sed 's/^/[IBM]   /'
log ""
log "Naechster Schritt: website/deploy-server.sh ausfuehren, damit"
log "https://ischlstrom.org/ibm/install.sh das neue Paket ausliefert."
