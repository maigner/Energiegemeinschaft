#!/usr/bin/env bash
# ============================================================================
# prepare-sd.sh - SD-Karte fuer eine provisionierte Anlage schreiben
#
#   sudo ./prepare-sd.sh sd-007.zip <geraet> [--image <openhabian.img.xz>]
#
#   <geraet>: macOS z. B. /dev/disk4, Linux z. B. /dev/sdb.
#   Ohne <geraet> listet das Skript die moeglichen Karten auf.
#
# Das Zip kommt vom Vorstands-Dashboard (ischlstrom.org/board/openhab,
# "SD-Karte vorbereiten" -> "Zip herunterladen") und enthaelt
# openhabian.conf, ibm-provision.conf und user-data. Das Skript
#
#   1. laedt das aktuelle openHABian-Image (64-bit) von GitHub in den Cache
#      (Linux /var/cache/ischlstrom, macOS /Library/Caches/ischlstrom,
#      oder --image <datei>),
#   2. schreibt es auf die Karte,
#   3. bestueckt die Boot-Partition (FAT): traegt Hostname, Linux-Passwort,
#      Zeitzone und WLAN aus dem Zip in die openhabian.conf der Karte ein
#      (die uebrigen Vorgaben des Images bleiben), legt ibm-provision.conf
#      dazu und ersetzt die user-data-Vorlage durch die aus dem Zip.
#
# Den Autostart der Einrichtung installiert cloud-init (im Image enthalten)
# beim ersten Boot aus der user-data: systemd-Unit ibm-firstboot, die nach
# der openHABian-Erstinstallation die Einrichtung von ischlstrom.org
# startet. Es wird also nur die FAT-Partition beschrieben - deshalb
# funktioniert das Skript auf macOS wie auf Linux, und SSH auf den Pi ist
# nicht noetig. Fehlt user-data im Zip (aeltere Downloads), wird sie aus
# firstboot/ibm-firstboot.{sh,service} erzeugt.
#
# Danach: Karte in den Pi, LAN (gleiches Netz wie der Wechselrichter) und
# Strom anstecken - der Rest laeuft von selbst (Fortschritt am Dashboard
# und im Mitgliederbereich).
# ============================================================================
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
os="$(uname -s)"
case "$os" in
  Darwin) default_cache="/Library/Caches/ischlstrom" ;;
  *)      default_cache="/var/cache/ischlstrom" ;;
esac
CACHE="${IBM_IMAGE_CACHE:-$default_cache}"
RELEASES_API="https://api.github.com/repos/openhab/openhabian/releases/latest"

log()  { echo "[prepare-sd] $*"; }
die()  { echo "[prepare-sd] FEHLER: $*" >&2; exit 1; }

usage() { sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

list_devices() {
  echo "[prepare-sd] Moegliche Karten:"
  if [ "$os" = "Darwin" ]; then
    diskutil list external physical
  else
    lsblk -dno NAME,SIZE,MODEL,RM | awk '$NF == 1 { $NF=""; print "  /dev/" $0 }'
  fi
}

zip=""; dev=""; image=""
while [ $# -gt 0 ]; do
  case "$1" in
    --image) image="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) if [ -z "$zip" ]; then zip="$1"; elif [ -z "$dev" ]; then dev="$1"; else usage; fi; shift ;;
  esac
done
[ -n "$zip" ] || usage
if [ -z "$dev" ]; then list_devices; exit 1; fi
[ "$(id -u)" -eq 0 ] || die "Bitte als root: sudo $0 $zip $dev"
[ -f "$zip" ] || die "Zip nicht gefunden: $zip"

needed="unzip xz dd curl python3"
case "$os" in
  Darwin) needed="$needed diskutil" ;;
  *)      needed="$needed lsblk partprobe mount" ;;
esac
for cmd in $needed; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' fehlt (macOS: brew install xz; Linux: apt install unzip xz-utils util-linux)."
done

# --- Geraet pruefen -----------------------------------------------------------
if [ "$os" = "Darwin" ]; then
  case "$dev" in
    /dev/disk[0-9]|/dev/disk[0-9][0-9]) ;;
    *) die "Bitte das ganze Geraet angeben (z. B. /dev/disk4, keine Partition)." ;;
  esac
  diskutil info "$dev" >/dev/null 2>&1 || die "Unbekanntes Geraet: $dev"
  sys_disk="$(df / | tail -1 | awk '{print $1}' | sed -E 's|(/dev/disk[0-9]+).*|\1|')"
  [ "$dev" != "$sys_disk" ] || die "$dev ist die Systemplatte."
  diskutil info "$dev" | grep -q "Internal: *Yes" && die "$dev ist eine interne Platte."
  size="$(diskutil info "$dev" | sed -n 's/.*Disk Size: *\([^(]*\) (.*/\1/p' | head -1)"
  model="$(diskutil info "$dev" | sed -n 's/.*Device \/ Media Name: *//p' | head -1)"
else
  [ -b "$dev" ] || die "Kein Blockgeraet: $dev"
  root_disk="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)"
  [ "/dev/$root_disk" != "$dev" ] || die "$dev ist die Systemplatte."
  if lsblk -no MOUNTPOINT "$dev" | grep -q .; then
    die "$dev hat eingehaengte Partitionen - zuerst aushaengen (umount)."
  fi
  size="$(lsblk -dno SIZE "$dev")"; model="$(lsblk -dno MODEL "$dev" | sed 's/ *$//')"
fi
log "Zielgeraet: $dev (${size:-?}, ${model:-ohne Modell}) - ALLE DATEN DARAUF WERDEN GELOESCHT."
read -r -p "[prepare-sd] Fortfahren? [j/N] " answer < /dev/tty
case "$answer" in [jJ]|[jJ][aA]|[yY]) ;; *) die "Abgebrochen." ;; esac

# --- Zip entpacken ----------------------------------------------------------------
work="$(mktemp -d)"
boot_mnt=""
cleanup() {
  rm -rf "$work"
  if [ -n "$boot_mnt" ] && [ "$os" != "Darwin" ]; then umount "$boot_mnt" 2>/dev/null || true; fi
}
trap cleanup EXIT
unzip -q -o "$zip" -d "$work/zip"
[ -f "$work/zip/openhabian.conf" ] && [ -f "$work/zip/ibm-provision.conf" ] \
  || die "Zip enthaelt nicht openhabian.conf und ibm-provision.conf."
# shellcheck disable=SC1090
. "$work/zip/ibm-provision.conf"
log "Anlage: $(sed -n 's/^hostname=//p' "$work/zip/openhabian.conf"), Code ${IBM_PROVISION_CODE:-?}"

# user-data: aus dem Zip, sonst aus den lokalen firstboot-Dateien erzeugen
# (gleicher Inhalt wie renderUserData() in website/src/lib/server/db/members/
# openhabProvision.js).
if [ -f "$work/zip/user-data" ]; then
  cp "$work/zip/user-data" "$work/user-data"
else
  [ -f "$here/firstboot/ibm-firstboot.sh" ] && [ -f "$here/firstboot/ibm-firstboot.service" ] \
    || die "Zip ohne user-data und firstboot/ nicht gefunden - neues Zip vom Dashboard laden."
  log "Zip ohne user-data (aelterer Download) - erzeuge sie aus firstboot/."
  {
    echo "#cloud-config"
    echo "# ISCHLSTROM Speichermanagement - Zero-Touch-Autostart der Einrichtung."
    echo "write_files:"
    echo "  - path: /usr/local/sbin/ibm-firstboot"
    echo "    permissions: '0755'"
    echo "    content: |"
    sed 's/^\(.\)/      \1/' "$here/firstboot/ibm-firstboot.sh"
    echo "  - path: /etc/systemd/system/ibm-firstboot.service"
    echo "    permissions: '0644'"
    echo "    content: |"
    sed 's/^\(.\)/      \1/' "$here/firstboot/ibm-firstboot.service"
    echo "runcmd:"
    echo "  - [systemctl, daemon-reload]"
    echo "  - [systemctl, enable, --now, ibm-firstboot.service]"
  } > "$work/user-data"
fi

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
if [ "$os" = "Darwin" ]; then
  diskutil unmountDisk "$dev" >/dev/null
  rdev="/dev/r${dev#/dev/}"
  log "Schreibe $image nach $rdev ..."
  xz -dc "$image" | dd of="$rdev" bs=4m status=progress
  sync
  boot_part="${dev}s1"
else
  log "Schreibe $image nach $dev ..."
  xz -dc "$image" | dd of="$dev" bs=4M status=progress conv=fsync
  sync
  partprobe "$dev" 2>/dev/null || true
  sleep 2
  case "$dev" in *[0-9]) boot_part="${dev}p1" ;; *) boot_part="${dev}1" ;; esac
fi

# --- Boot-Partition -----------------------------------------------------------------
if [ "$os" = "Darwin" ]; then
  ok=""
  for _ in $(seq 1 20); do
    if diskutil mount "$boot_part" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  [ -n "$ok" ] || die "Boot-Partition $boot_part laesst sich nicht einhaengen."
  boot_mnt="$(diskutil info "$boot_part" | sed -n 's/.*Mount Point: *//p' | head -1)"
  [ -n "$boot_mnt" ] && [ -d "$boot_mnt" ] || die "Einhaengepunkt von $boot_part nicht gefunden."
else
  for _ in $(seq 1 20); do [ -b "$boot_part" ] && break; sleep 1; done
  [ -b "$boot_part" ] || die "Partition $boot_part nicht gefunden."
  boot_mnt="$(mktemp -d)"
  mount "$boot_part" "$boot_mnt"
fi

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
cp "$work/user-data" "$boot_mnt/user-data"
log "Boot-Partition: openhabian.conf angepasst, ibm-provision.conf und user-data kopiert."

if [ "$os" = "Darwin" ]; then
  diskutil eject "$dev" >/dev/null || true
else
  umount "$boot_mnt"; boot_mnt=""
  sync
  command -v eject >/dev/null 2>&1 && eject "$dev" 2>/dev/null || true
fi

cat <<FERTIG
[prepare-sd]
[prepare-sd] Fertig. Karte in den Raspberry Pi, LAN-Kabel (gleiches Netz wie
[prepare-sd] der Wechselrichter) und Strom anstecken. openHABian installiert
[prepare-sd] sich zuerst selbst (30 bis 45 Minuten), danach richtet
[prepare-sd] ibm-firstboot das Speichermanagement ein - ohne SSH. Fortschritt:
[prepare-sd]   ${IBM_BASE_URL:-https://ischlstrom.org}/board/openhab
[prepare-sd]
FERTIG
