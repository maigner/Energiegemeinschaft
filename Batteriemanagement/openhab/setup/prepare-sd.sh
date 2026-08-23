#!/usr/bin/env bash
# ============================================================================
# prepare-sd.sh - SD-Karte fuer eine provisionierte Anlage schreiben
#
#   sudo ./prepare-sd.sh sd-007.zip /dev/sdX [--image <openhabian.img.xz>]
#
# Das Zip kommt vom Vorstands-Dashboard (ischlstrom.org/board/openhab,
# "SD-Karte vorbereiten" -> "Zip herunterladen") und enthaelt
# openhabian.conf und ibm-provision.conf. Das Skript
#
#   1. laedt das aktuelle openHABian-Image (64-bit) von GitHub in den Cache
#      (/var/cache/ischlstrom, oder --image <datei>),
#   2. schreibt es auf die Karte,
#   3. Boot-Partition: traegt Hostname, Linux-Passwort, Zeitzone und WLAN
#      aus dem Zip in die openhabian.conf der Karte ein (die uebrigen
#      Vorgaben des Images bleiben) und legt ibm-provision.conf dazu,
#   4. Root-Partition: installiert ibm-firstboot (Skript + systemd-Unit aus
#      firstboot/), das nach der openHABian-Erstinstallation die
#      Einrichtung von ischlstrom.org startet.
#
# Danach: Karte in den Pi, LAN und Strom anstecken - der Rest laeuft von
# selbst (Fortschritt am Dashboard und im Mitgliederbereich).
#
# Nur Linux (losetup/mount, ext4). Auf anderen Systemen: Image mit dem
# Raspberry Pi Imager schreiben, die beiden Dateien aus dem Zip auf die
# Boot-Partition kopieren und nach dem ersten Boot per SSH
#   curl -fsSL https://ischlstrom.org/ibm/install.sh | sudo bash
# ausfuehren (liest den Code von der Karte, keine Rueckfragen).
# ============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="${IBM_IMAGE_CACHE:-/var/cache/ischlstrom}"
RELEASES_API="https://api.github.com/repos/openhab/openhabian/releases/latest"

log()  { echo "[prepare-sd] $*"; }
die()  { echo "[prepare-sd] FEHLER: $*" >&2; exit 1; }

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

zip=""; dev=""; image=""
while [ $# -gt 0 ]; do
  case "$1" in
    --image) image="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) if [ -z "$zip" ]; then zip="$1"; elif [ -z "$dev" ]; then dev="$1"; else usage; fi; shift ;;
  esac
done
[ -n "$zip" ] && [ -n "$dev" ] || usage
[ "$(id -u)" -eq 0 ] || die "Bitte als root: sudo $0 $zip $dev"
[ -f "$zip" ] || die "Zip nicht gefunden: $zip"
[ -b "$dev" ] || die "Kein Blockgeraet: $dev"
for cmd in unzip xz dd lsblk partprobe mount; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' fehlt (apt install unzip xz-utils util-linux)."
done

# --- Geraet pruefen -----------------------------------------------------------
root_disk="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)"
[ "/dev/$root_disk" != "$dev" ] || die "$dev ist die Systemplatte."
if lsblk -no MOUNTPOINT "$dev" | grep -q .; then
  die "$dev hat eingehaengte Partitionen - zuerst aushaengen (umount)."
fi
size="$(lsblk -dno SIZE "$dev")"; model="$(lsblk -dno MODEL "$dev" | sed 's/ *$//')"
log "Zielgeraet: $dev ($size, ${model:-ohne Modell}) - ALLE DATEN DARAUF WERDEN GELOESCHT."
read -r -p "[prepare-sd] Fortfahren? [j/N] " answer < /dev/tty
case "$answer" in [jJ]|[jJ][aA]|[yY]) ;; *) die "Abgebrochen." ;; esac

# --- Zip entpacken ----------------------------------------------------------------
work="$(mktemp -d)"
trap 'rm -rf "$work"; [ -n "${boot_mnt:-}" ] && umount "$boot_mnt" 2>/dev/null; [ -n "${root_mnt:-}" ] && umount "$root_mnt" 2>/dev/null; true' EXIT
unzip -q -o "$zip" -d "$work/zip"
[ -f "$work/zip/openhabian.conf" ] && [ -f "$work/zip/ibm-provision.conf" ] \
  || die "Zip enthaelt nicht openhabian.conf und ibm-provision.conf."
# shellcheck disable=SC1090
. "$work/zip/ibm-provision.conf"
log "Anlage: $(sed -n 's/^hostname=//p' "$work/zip/openhabian.conf"), Code ${IBM_PROVISION_CODE:-?}"

# --- Image ------------------------------------------------------------------------
mkdir -p "$CACHE"
if [ -z "$image" ]; then
  log "Suche das aktuelle openHABian-Image (64-bit) ..."
  asset="$(curl -fsSL "$RELEASES_API" | python3 -c '
import json, sys
r = json.load(sys.stdin)
assets = [a for a in r["assets"] if a["name"].startswith("openhabian-raspios64") and a["name"].endswith(".img.xz")]
assets.sort(key=lambda a: a["name"])
a = assets[-1]
print(a["name"] + "\t" + a["browser_download_url"])')" || die "Release-Liste nicht abrufbar."
  name="${asset%%$'\t'*}"; url="${asset#*$'\t'}"
  image="$CACHE/$name"
  if [ -s "$image" ]; then
    log "Image im Cache: $image"
  else
    log "Lade $name (rund 1,4 GB) ..."
    curl -fL --progress-bar -o "$image.part" "$url" && mv "$image.part" "$image"
  fi
fi
[ -s "$image" ] || die "Image nicht gefunden: $image"
# Der CRC im Dateinamen (crc<hex>) gilt fuer das entpackte Image; xz prueft
# die Archiv-Integritaet beim Entpacken ohnehin.
xz -t "$image" || die "Image-Archiv ist beschaedigt: $image"

# --- Schreiben ----------------------------------------------------------------------
log "Schreibe $image nach $dev ..."
xz -dc "$image" | dd of="$dev" bs=4M status=progress conv=fsync
sync
partprobe "$dev" 2>/dev/null || true
sleep 2

case "$dev" in *[0-9]) p="${dev}p" ;; *) p="$dev" ;; esac
boot_part="${p}1"; root_part="${p}2"
for _ in $(seq 1 20); do [ -b "$boot_part" ] && [ -b "$root_part" ] && break; sleep 1; done
[ -b "$boot_part" ] && [ -b "$root_part" ] || die "Partitionen $boot_part/$root_part nicht gefunden."

# --- Boot-Partition -----------------------------------------------------------------
boot_mnt="$(mktemp -d)"
mount "$boot_part" "$boot_mnt"
conf="$boot_mnt/openhabian.conf"
[ -f "$conf" ] || die "openhabian.conf fehlt auf der Boot-Partition - kein openHABian-Image?"
# Nur die Werte der Anlage aus dem Zip in die vorhandene Datei mischen
# (vorhandene Schluessel ersetzen, fehlende anhaengen); alle uebrigen
# Vorgaben und Marker des Images bleiben unveraendert.
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"
  case "$key" in hostname|username|userpw|timezone|wifi_ssid|wifi_password|wifi_country) ;; *) continue ;; esac
  if grep -qE "^${key}=" "$conf"; then
    IBM_LINE="$line" IBM_KEY="$key" python3 - "$conf" <<'PY'
import os, re, sys
p = sys.argv[1]; key = os.environ["IBM_KEY"]; line = os.environ["IBM_LINE"]
src = open(p).read().split("\n")
src = [line if re.match(r"^" + re.escape(key) + r"=", l) else l for l in src]
open(p, "w").write("\n".join(src))
PY
  else
    printf '%s\n' "$line" >> "$conf"
  fi
done < "$work/zip/openhabian.conf"
cp "$work/zip/ibm-provision.conf" "$boot_mnt/ibm-provision.conf"
log "Boot-Partition: openhabian.conf angepasst, ibm-provision.conf kopiert."
umount "$boot_mnt"; boot_mnt=""

# --- Root-Partition: ibm-firstboot ----------------------------------------------------
root_mnt="$(mktemp -d)"
mount "$root_part" "$root_mnt"
install -m 0755 "$here/firstboot/ibm-firstboot.sh" "$root_mnt/usr/local/sbin/ibm-firstboot"
install -m 0644 "$here/firstboot/ibm-firstboot.service" "$root_mnt/etc/systemd/system/ibm-firstboot.service"
mkdir -p "$root_mnt/etc/systemd/system/multi-user.target.wants"
ln -sf /etc/systemd/system/ibm-firstboot.service \
  "$root_mnt/etc/systemd/system/multi-user.target.wants/ibm-firstboot.service"
mkdir -p "$root_mnt/var/lib/ischlstrom"
log "Root-Partition: ibm-firstboot installiert."
umount "$root_mnt"; root_mnt=""
sync

command -v eject >/dev/null 2>&1 && eject "$dev" 2>/dev/null || true
cat <<FERTIG
[prepare-sd]
[prepare-sd] Fertig. Karte in den Raspberry Pi, LAN-Kabel (gleiches Netz wie
[prepare-sd] der Wechselrichter) und Strom anstecken. openHABian installiert
[prepare-sd] sich zuerst selbst (30 bis 45 Minuten), danach richtet
[prepare-sd] ibm-firstboot das Speichermanagement ein. Fortschritt:
[prepare-sd]   ${IBM_BASE_URL:-https://ischlstrom.org}/board/openhab
[prepare-sd]
FERTIG
