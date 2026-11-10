#!/usr/bin/env bash
# ============================================================================
# 13 - Wartungszugang per SSH-Schluessel
#
# Traegt den oeffentlichen Wartungsschluessel aus dem Paket
# (setup/ibm-maint.pub) in die authorized_keys von WG_SSH_USER ein und
# erlaubt diesem Benutzer sudo ohne Passwort. Damit braucht die Fernwartung
# (auch die durch Agenten) keine Passwortdateien mehr: der private
# Schluessel liegt im ssh-agent des Entwicklungsrechners und ist fuer
# Programme benutzbar, aber nicht lesbar.
#
# Der Schluessel kommt mit dem signierten Paket (minisign, siehe
# 09-install-updater.sh), nicht per Download - wer ihn austauschen will,
# braucht den Release-Schluessel.
#
# Bewusst ZUSAETZLICH zur Passwort-Anmeldung: das Linux-Passwort bleibt
# gueltig (Dashboard), aber mit SSH_PASSWORD_TUNNEL_ONLY=1 nur noch durch
# den Tunnel vom Wartungsserver, nicht mehr aus dem Heimnetz des Mitglieds
# (Abschnitt unten). Eine fruehere Fassung (09-harden-ssh.sh, bis
# 2026-08-02) schaltete die Passwort-Anmeldung ganz ab; deren Reste baut
# 08-install-wireguard.sh weiterhin zurueck. Schluessel und Drop-in hier
# sind davon unabhaengig (Kommentar "ibm-maint", 10-ibm-tunnel-only.conf).
#
# MAINT_SSH_FROM beschraenkt den Schluessel auf Verbindungen von dieser
# Adresse (Vorgabe 10.88.0.1 = Wartungsserver im Tunnel; leer = ohne
# Beschraenkung). MAINT_SUDO_NOPASSWD=0 laesst sudo beim Passwort.
# INSTALL_MAINT_KEY=0 entfernt Schluessel und sudo-Regel wieder.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
load_config

PUBKEY_FILE="$IBM_SETUP_DIR/ibm-maint.pub"
MARK="ibm-maint"
SUDOERS=/etc/sudoers.d/90-ibm-maint

ssh_user="${WG_SSH_USER:-openhabian}"
ssh_home="$(getent passwd "$ssh_user" | cut -d: -f6 || true)"
ssh_group="$(id -gn "$ssh_user" 2>/dev/null || true)"
akfile="$ssh_home/.ssh/authorized_keys"

# Entfernt alle von diesem Skript gesetzten Zeilen (letztes Feld = Marker).
strip_key() {
  [ -f "$akfile" ] || return 0
  awk -v m="$MARK" '$NF != m' "$akfile" > "$akfile.ibm-tmp"
  if cmp -s "$akfile.ibm-tmp" "$akfile"; then
    rm -f "$akfile.ibm-tmp"
    return 1
  fi
  chown "$ssh_user:$ssh_group" "$akfile.ibm-tmp"
  chmod 600 "$akfile.ibm-tmp"
  mv "$akfile.ibm-tmp" "$akfile"
}

remove_all() {
  if [ -n "$ssh_home" ] && strip_key; then
    log "Wartungsschluessel aus $akfile entfernt."
  fi
  if [ -f "$SUDOERS" ]; then
    rm -f "$SUDOERS"
    log "entfernt: $SUDOERS (sudo verlangt wieder das Passwort)."
  fi
}

# --- Passwort-Anmeldung nur durch den Tunnel ---------------------------------
# SSH_PASSWORD_TUNNEL_ONLY=1: sshd nimmt Passwoerter nur noch von
# MAINT_SSH_FROM an (Wartungsserver im Tunnel); aus dem Heimnetz des
# Mitglieds ist keine Passwort-Anmeldung mehr moeglich. Vor Ort bleibt die
# Konsole (Bildschirm und Tastatur).
#
# Der Dateiname sortiert bewusst vor allen anderen Drop-ins: sshd nimmt je
# Option den ERSTEN Wert, ein spaeteres "PasswordAuthentication yes" (z. B.
# 50-cloud-init.conf) aendert dann nichts mehr. "Match all" am Ende beendet
# den Match-Block fuer alles, was danach gelesen wird.
#
# Schutz vor dem Aussperren: die Sperre wird nur gesetzt, wenn der Tunnel
# gerade steht (Handshake juenger als 10 Minuten), und nur uebernommen, wenn
# sshd die Datei annimmt und fuer die Tunneladresse weiterhin Passwoerter
# zulaesst. Sonst bleibt bzw. kommt der vorige Zustand zurueck.
SSHD_DROPIN=/etc/ssh/sshd_config.d/10-ibm-tunnel-only.conf
sshd_failed=0
# /usr/sbin fehlt je nach Aufrufer im PATH.
SSHD_BIN="$(command -v sshd || echo /usr/sbin/sshd)"

reload_sshd() {
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null \
    || warn "sshd konnte nicht neu geladen werden - bitte manuell: sudo systemctl reload ssh"
}

sshd_password_for() {
  "$SSHD_BIN" -T -C "user=$ssh_user,host=x,addr=$1" 2>/dev/null \
    | awk '$1 == "passwordauthentication" { print $2 }'
}

tunnel_alive() {
  local newest now
  command -v wg >/dev/null 2>&1 || return 1
  newest="$(wg show wg0 latest-handshakes 2>/dev/null | awk '$2 > m { m = $2 } END { print m + 0 }')"
  now="$(date +%s)"
  [ "${newest:-0}" -gt 0 ] && [ $((now - newest)) -lt 600 ]
}

remove_sshd_dropin() {
  [ -f "$SSHD_DROPIN" ] || return 0
  rm -f "$SSHD_DROPIN"
  reload_sshd
  log "entfernt: $SSHD_DROPIN (Passwort-Anmeldung wieder aus jedem Netz)."
}

install_sshd_dropin() {
  local tmp old="" from_test
  # Erste Adresse der Liste fuer die Gegenprobe (ohne Netzmaske).
  from_test="$(printf '%s' "$MAINT_SSH_FROM" | cut -d, -f1 | cut -d/ -f1)"
  tmp="$(mktemp)"
  cat > "$tmp" <<SSHD
# GENERIERT von IBM (13-install-maint-key.sh) - nicht direkt bearbeiten.
# Passwort-Anmeldung nur vom Wartungsserver durch den WireGuard-Tunnel.
PasswordAuthentication no
KbdInteractiveAuthentication no
Match Address $MAINT_SSH_FROM
    PasswordAuthentication yes
Match all
SSHD
  if [ -f "$SSHD_DROPIN" ] && cmp -s "$tmp" "$SSHD_DROPIN"; then
    rm -f "$tmp"
    log "unveraendert: $SSHD_DROPIN"
    return 0
  fi
  if ! tunnel_alive; then
    rm -f "$tmp"
    warn "Tunnel steht nicht (kein frischer Handshake) - Passwort-Sperre fuer das Heimnetz wird erst beim naechsten Lauf gesetzt."
    return 0
  fi
  if [ -f "$SSHD_DROPIN" ]; then
    old="$(mktemp)"
    cp -p "$SSHD_DROPIN" "$old"
  fi
  install -m 644 -o root -g root "$tmp" "$SSHD_DROPIN"
  rm -f "$tmp"
  if "$SSHD_BIN" -t 2>/dev/null \
     && [ "$(sshd_password_for "$from_test")" = "yes" ] \
     && [ "$(sshd_password_for 192.0.2.1)" = "no" ]; then
    [ -z "$old" ] || rm -f "$old"
    reload_sshd
    log "Passwort-Anmeldung nur noch von $MAINT_SSH_FROM (Tunnel): $SSHD_DROPIN"
  else
    if [ -n "$old" ]; then
      install -m 644 -o root -g root "$old" "$SSHD_DROPIN"
      rm -f "$old"
    else
      rm -f "$SSHD_DROPIN"
    fi
    # Kein Abbruch: der Wartungsschluessel unten haengt nicht davon ab.
    warn "sshd nimmt $SSHD_DROPIN nicht wie erwartet an (anderes Drop-in mit Vorrang?) - voriger Zustand wiederhergestellt, sshd nicht neu geladen."
    sshd_failed=1
  fi
}

if [ "$SSH_PASSWORD_TUNNEL_ONLY" = "1" ] && [ "$INSTALL_WIREGUARD" = "1" ] && [ -n "$MAINT_SSH_FROM" ]; then
  printf '%s' "$MAINT_SSH_FROM" | grep -qE '^[0-9A-Fa-f.:/,]+$' \
    || die "MAINT_SSH_FROM enthaelt unerlaubte Zeichen: $MAINT_SSH_FROM"
  install_sshd_dropin
else
  remove_sshd_dropin
  log "Passwort-Anmeldung nicht auf den Tunnel beschraenkt (SSH_PASSWORD_TUNNEL_ONLY=$SSH_PASSWORD_TUNNEL_ONLY, INSTALL_WIREGUARD=$INSTALL_WIREGUARD)."
fi

# --- Wartungsschluessel -------------------------------------------------------
if [ "$INSTALL_MAINT_KEY" != "1" ]; then
  remove_all
  log "INSTALL_MAINT_KEY=0 - kein Wartungsschluessel."
  exit "$sshd_failed"
fi

if [ ! -f "$PUBKEY_FILE" ]; then
  log "Kein $PUBKEY_FILE im Paket - Wartungszugang bleibt beim Passwort."
  exit "$sshd_failed"
fi

[ -n "$ssh_home" ] && [ -d "$ssh_home" ] \
  || die "Benutzer $ssh_user (WG_SSH_USER) hat kein Home-Verzeichnis."

# Genau ein Schluessel: "<typ> <base64> [kommentar]". Optionen vor dem Typ
# (command=, from=) nimmt das Skript nicht an - die setzt es selbst.
key_line="$(grep -vE '^[[:space:]]*(#|$)' "$PUBKEY_FILE" | head -n1 || true)"
key_type="$(printf '%s' "$key_line" | awk '{print $1}')"
key_data="$(printf '%s' "$key_line" | awk '{print $2}')"
case "$key_type" in
  ssh-ed25519|sk-ssh-ed25519@openssh.com|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|ssh-rsa) ;;
  *) die "$PUBKEY_FILE: unbekannter Schluesseltyp '$key_type'." ;;
esac
printf '%s' "$key_data" | grep -qE '^[A-Za-z0-9+/]{40,}={0,2}$' \
  || die "$PUBKEY_FILE: Schluesseldaten nicht lesbar."
if command -v ssh-keygen >/dev/null 2>&1; then
  printf '%s %s\n' "$key_type" "$key_data" | ssh-keygen -l -f /dev/stdin >/dev/null 2>&1 \
    || die "$PUBKEY_FILE: ssh-keygen lehnt den Schluessel ab."
fi

options=""
if [ -n "$MAINT_SSH_FROM" ]; then
  printf '%s' "$MAINT_SSH_FROM" | grep -qE '^[0-9A-Fa-f.:/,*?!]+$' \
    || die "MAINT_SSH_FROM enthaelt unerlaubte Zeichen: $MAINT_SSH_FROM"
  options="from=\"$MAINT_SSH_FROM\" "
fi
entry="${options}${key_type} ${key_data} ${MARK}"

install -d -m 700 -o "$ssh_user" -g "$ssh_group" "$ssh_home/.ssh"
if [ -f "$akfile" ] && grep -qxF "$entry" "$akfile" \
   && [ "$(awk -v m="$MARK" '$NF == m' "$akfile" | wc -l)" -eq 1 ]; then
  log "unveraendert: Wartungsschluessel in $akfile"
else
  strip_key || true
  # Fehlender Zeilenumbruch am Dateiende wuerde den Eintrag an die letzte
  # Zeile haengen.
  if [ -s "$akfile" ] && [ -n "$(tail -c1 "$akfile")" ]; then
    echo >> "$akfile"
  fi
  printf '%s\n' "$entry" >> "$akfile"
  chown "$ssh_user:$ssh_group" "$akfile"
  chmod 600 "$akfile"
  log "Wartungsschluessel eingetragen: $akfile (${MAINT_SSH_FROM:+nur von $MAINT_SSH_FROM, }$key_type)."
fi

if [ "$MAINT_SUDO_NOPASSWD" = "1" ]; then
  tmp="$(mktemp)"
  cat > "$tmp" <<SUDO
# GENERIERT von IBM (13-install-maint-key.sh) - nicht direkt bearbeiten.
$ssh_user ALL=(ALL:ALL) NOPASSWD: ALL
SUDO
  if [ -f "$SUDOERS" ] && cmp -s "$tmp" "$SUDOERS"; then
    log "unveraendert: $SUDOERS"
    rm -f "$tmp"
  elif visudo -cf "$tmp" >/dev/null 2>&1; then
    install -m 440 -o root -g root "$tmp" "$SUDOERS"
    rm -f "$tmp"
    log "sudo ohne Passwort fuer $ssh_user: $SUDOERS"
  else
    rm -f "$tmp"
    die "visudo lehnt die sudo-Regel ab - $SUDOERS nicht geschrieben."
  fi
elif [ -f "$SUDOERS" ]; then
  rm -f "$SUDOERS"
  log "MAINT_SUDO_NOPASSWD=0 - $SUDOERS entfernt, sudo verlangt das Passwort."
fi

exit "$sshd_failed"
