#!/usr/bin/env bash
# ============================================================================
# Packt die IBM-Skripte fuer die Auslieferung ueber ischlstrom.org.
#
# Erzeugt in website/static/ibm/:
#   ibm-openhab.tgz          das Paket
#   ibm-openhab.tgz.sha256   Pruefsumme (Download-Integritaet, Nachtvergleich)
#   ibm-openhab.tgz.minisig  Signatur (minisign) - der Updater auf den Pis
#                            (ibm-update) spielt nur Pakete ein, deren
#                            Signatur zum installierten setup/ibm-release.pub
#                            passt; ein kompromittierter Server kann so kein
#                            Update auf die Flotte schieben.
#
# Signieren: braucht minisign (apt install minisign / brew install minisign)
# und den privaten Release-Schluessel, Vorgabe ~/.minisign/ibm-release.key
# (IBM_SIGN_KEY=<pfad> fuer einen anderen Ort); minisign fragt sein
# Passwort ab. Der oeffentliche Schluessel liegt im Repo unter
# setup/ibm-release.pub und damit im Paket. Erzeugen (einmalig):
#   minisign -G -p Batteriemanagement/openhab/setup/ibm-release.pub \
#               -s ~/.minisign/ibm-release.key
# Den privaten Schluessel sichern (Passwort-Manager): ohne ihn nimmt die
# Flotte kein Update mehr an, nur noch install.sh von Hand je Pi.
# Schluesselwechsel: neuen Public-Key ins Repo, das Paket noch einmal mit
# dem ALTEN Key signieren und ausrollen, erst danach mit dem neuen.
#
# Endung .tgz statt .tar.gz: sirv (adapter-node) liefert *.gz-Dateien mit
# "Content-Encoding: gzip" aus - Clients ohne Accept-Encoding bekommen dann
# das entpackte Tar und die Pruefsumme schlaegt fehl.
#
# Wird von website/deploy-server.sh automatisch aufgerufen; fuer einen
# lokalen Test kann es auch einzeln ausgefuehrt werden.
#
# Gebaut wird nur, wenn sich der Paketinhalt seit dem letzten Build geaendert
# hat: die Pruefsumme der Quellen liegt neben dem Paket in
# ibm-openhab.tgz.source, stimmt sie ueberein, bleibt das Paket unangetastet.
# Sonst wuerde jeder Website-Deploy ein neues Paket (Build-Datum, Commit in
# BUILD-INFO) erzeugen und damit ein naechtliches Update der ganzen Flotte
# ausloesen. Mit --force wird in jedem Fall neu gebaut.
# ============================================================================
set -euo pipefail

force=0
case "${1:-}" in
  --force) force=1 ;;
  "") ;;
  *) echo "Aufruf: $0 [--force]" >&2; exit 1 ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
openhab_dir="$(cd "$here/.." && pwd)"          # Batteriemanagement/openhab
repo_root="$(cd "$openhab_dir/../.." && pwd)"  # Repository-Wurzel
dist_dir="$repo_root/website/static/ibm"

tarball="$dist_dir/ibm-openhab.tgz"
checksum="$tarball.sha256"
signature="$tarball.minisig"
source_stamp="$tarball.source"
pubkey="$openhab_dir/setup/ibm-release.pub"
sign_key="${IBM_SIGN_KEY:-$HOME/.minisign/ibm-release.key}"

log() { echo "[IBM] $*"; }
die() { echo "[IBM] FEHLER: $*" >&2; exit 1; }

[ -d "$repo_root/website/static" ] || die "website/static nicht gefunden - Repository-Wurzel falsch erkannt: $repo_root"
[ -f "$openhab_dir/setup/install-ibm.sh" ] || die "setup/install-ibm.sh nicht gefunden in $openhab_dir"

command -v python3 >/dev/null 2>&1 || die "python3 fehlt (wird fuer die Overview-Konvertierung gebraucht)."
python3 -c 'import yaml' 2>/dev/null || die "PyYAML fehlt: sudo apt install python3-yaml"
command -v minisign >/dev/null 2>&1 || die "minisign fehlt (apt install minisign / brew install minisign) - das Paket muss signiert werden."
[ -f "$pubkey" ] || die "Release-Schluessel fehlt: $pubkey - einmalig erzeugen mit: minisign -G -p $pubkey -s $sign_key"
[ -f "$sign_key" ] || die "Privater Release-Schluessel fehlt: $sign_key (IBM_SIGN_KEY=<pfad> fuer einen anderen Ort)."

sign_package() {
  rm -f "$signature"
  minisign -S -s "$sign_key" -m "$tarball" -x "$signature" -t "ibm-openhab.tgz $(cat "$dist_dir/VERSION" 2>/dev/null || echo unbekannt)" \
    || die "Signieren fehlgeschlagen."
  # Gegenprobe mit dem Public-Key aus dem Repo: faengt einen falschen
  # privaten Schluessel ab, bevor die Flotte das Paket ablehnt.
  minisign -Vq -p "$pubkey" -m "$tarball" -x "$signature" \
    || die "Signatur passt nicht zu $pubkey - falscher privater Schluessel ($sign_key)?"
  log "signiert: $signature"
}

mkdir -p "$dist_dir"

# Was nicht auf die Pis gehoert: lokale Konfiguration, Backups, die
# Replay-Daten (Betriebsdaten aus der Produktivdatenbank, gitignored) und die
# Hersteller-PDFs der Profile (nur Entwicklungsunterlagen, ~25 MB).
excludes=(
  --exclude='setup/ibm.conf'
  --exclude='*.bak-*'
  --exclude='.gitignore'
  --exclude='control/replay/*.csv'
  --exclude='control/replay/*.txt'
  --exclude='inverters/*/docs/*.pdf'
)

# Pruefsumme des Paketinhalts: dieselben Quellen und Ausschluesse wie der
# tar-Aufruf unten, ohne die erzeugten Dateien (BUILD-INFO, page-*.json).
# Bewusst nicht ueber tar: GNU tar (--sort, --mtime, --owner) und bsdtar
# (macOS) erzeugen verschiedene Archive und bsdtar kennt --sort nicht
# (Deploy vom Mac, 2026-10-04). Gehasht werden sortierte relative Pfade plus
# Dateiinhalte - auf jedem System gleich. Die Ausschlussmuster gelten wie
# bei tar unverankert (passen auf jedes Pfadende).
hash_excludes="$(printf '%s\n' "${excludes[@]#--exclude=}" | tr -d "'")
BUILD-INFO
page-*.json"
source_hash="$(IBM_HASH_ROOT="$openhab_dir" IBM_HASH_EXCLUDES="$hash_excludes" python3 - <<'HASHPY'
import fnmatch, hashlib, os
root = os.environ["IBM_HASH_ROOT"]
patterns = [p for p in os.environ["IBM_HASH_EXCLUDES"].splitlines() if p]
def excluded(rel):
    parts = rel.split("/")
    tails = ["/".join(parts[i:]) for i in range(len(parts))]
    return any(fnmatch.fnmatchcase(t, pat) for pat in patterns for t in tails)
h = hashlib.sha256()
for dirpath, dirnames, filenames in os.walk(root):
    dirnames.sort()
    for name in sorted(filenames):
        full = os.path.join(dirpath, name)
        rel = os.path.relpath(full, root)
        if excluded(rel):
            continue
        h.update(rel.encode() + b"\0")
        if os.path.islink(full):
            h.update(os.readlink(full).encode())
        else:
            with open(full, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 16), b""):
                    h.update(chunk)
        h.update(b"\0")
print(h.hexdigest())
HASHPY
)"

if [ "$force" -eq 0 ] && [ -f "$tarball" ] && [ -f "$checksum" ] && [ -f "$dist_dir/VERSION" ] \
   && [ "$(cat "$source_stamp" 2>/dev/null)" = "$source_hash" ]; then
  log "Paketinhalt unveraendert seit dem letzten Build - kein Neubau (Stand: $(cat "$dist_dir/VERSION"), --force erzwingt)."
  # Signatur fehlt oder passt nicht (erster Build nach der Einfuehrung,
  # Schluesselwechsel): nur neu signieren, das Paket bleibt - ein Neubau
  # wuerde ein Flotten-Update ausloesen.
  if [ -f "$signature" ] && minisign -Vq -p "$pubkey" -m "$tarball" -x "$signature" 2>/dev/null; then
    log "Signatur gueltig: $signature"
  else
    log "Signatur fehlt oder passt nicht - signiere das bestehende Paket neu."
    sign_package
  fi
  exit 0
fi

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
    "${excludes[@]}" \
    "$(basename "$openhab_dir")"

# Versionsstring wie ihn die Pis melden (04-install-rules.sh aus BUILD-INFO):
# das Dashboard vergleicht damit den Stand jeder Anlage.
{
  d="$(sed -n 's/^gebaut am: \([0-9-]*\).*/\1/p' "$build_info")"
  c="$(sed -n 's/^commit: \(.*\)/\1/p' "$build_info")"
  printf '%s%s\n' "${d:-unbekannt}" "${c:+ ($c)}"
} > "$dist_dir/VERSION"
log "erzeugt: $dist_dir/VERSION ($(cat "$dist_dir/VERSION"))"

rm -f "$build_info"
[ "${#generated_pages[@]}" -gt 0 ] && rm -f "${generated_pages[@]}"

( cd "$dist_dir" && sha256sum "$(basename "$tarball")" > "$(basename "$checksum")" )
sign_package
echo "$source_hash" > "$source_stamp"

log "erzeugt: $tarball ($(du -h "$tarball" | cut -f1))"
log "erzeugt: $checksum"
log ""
log "Inhalt:"
tar -tzf "$tarball" | sed 's/^/[IBM]   /'
log ""
log "Ausgeliefert wird das Paket ueber website/deploy-server.sh unter"
log "https://ischlstrom.org/ibm/install.sh."
