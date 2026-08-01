#!/usr/bin/env bash
# ============================================================================
# 09 - SSH-Zugang absichern
#
# Richtet die Schluessel-Anmeldung fuer die Fernwartung ein und schaltet
# danach die Passwort-Anmeldung von sshd ab. Das openHABian-Standardpasswort
# ('openhabian') ist allgemein bekannt - solange die Passwort-Anmeldung
# aktiv ist, ist die Anlage darueber angreifbar.
#
# Zwei Anmeldewege, beide ueber <IBM_API_BASE>/ibm/ verteilt:
#
#   ssh-maintainer.pub  Public Key der Fernwartung; landet in den
#                       authorized_keys des Wartungsbenutzers (WG_SSH_USER).
#   ssh-user-ca.pub     Optional: Public Key einer SSH-Benutzer-CA
#                       (TrustedUserCAKeys). Damit gelten vom Wartungsteam
#                       signierte SSH-Zertifikate auf allen Anlagen, ohne
#                       dass je Anlage ein Schluessel eingetragen wird.
#
# Die Passwort-Anmeldung wird NUR abgeschaltet, wenn mindestens einer der
# beiden Wege eingerichtet ist - sonst waere die Anlage ausgesperrt.
# Die sshd-Konfiguration wird vor dem Neuladen mit 'sshd -t' geprueft und
# bei einem Fehler zurueckgerollt. Idempotent.
#
# Braucht in ibm.conf: INSTALL_SSH_HARDENING=1 (nur Schluessel eintragen:
# genuegt INSTALL_WIREGUARD=1). Laufende SSH-Sitzungen bleiben beim
# Neuladen von sshd bestehen.
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
load_config

SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_DROPIN_DIR="/etc/ssh/sshd_config.d"
SSHD_DROPIN="$SSHD_DROPIN_DIR/90-ibm-hardening.conf"
SSH_CA_FILE="/etc/ssh/ibm-user-ca.pub"
SSHD_BIN="$(command -v sshd || echo /usr/sbin/sshd)"

if [ "$INSTALL_SSH_HARDENING" != "1" ] && [ "$INSTALL_WIREGUARD" != "1" ]; then
  log "SSH-Haertung nicht gewuenscht (INSTALL_SSH_HARDENING=0) - uebersprungen."
  exit 0
fi

[ -n "$WG_SSH_USER" ] || die "WG_SSH_USER ist leer - kein Benutzer fuer die Schluessel-Anmeldung."
[ -x "$SSHD_BIN" ] || die "sshd nicht gefunden - laeuft hier ueberhaupt ein SSH-Server?"

ssh_home="$(getent passwd "$WG_SSH_USER" | cut -d: -f6 || true)"
[ -n "$ssh_home" ] || die "Benutzer '$WG_SSH_USER' nicht gefunden."
akfile="$ssh_home/.ssh/authorized_keys"

# Prueft, ob eine Datei mindestens einen gueltigen SSH-Public-Key enthaelt.
has_valid_key() { [ -s "$1" ] && ssh-keygen -lf "$1" >/dev/null 2>&1; }

# --- Wartungsschluessel (authorized_keys) -----------------------------------
ssh_key="$(curl -fsSL "$IBM_API_BASE/ibm/ssh-maintainer.pub" 2>/dev/null | head -n1 || true)"
if [ -z "$ssh_key" ]; then
  log "Kein SSH-Wartungsschluessel unter $IBM_API_BASE/ibm/ssh-maintainer.pub - uebersprungen."
elif ! printf '%s\n' "$ssh_key" | ssh-keygen -lf /dev/stdin >/dev/null 2>&1; then
  warn "Datei unter $IBM_API_BASE/ibm/ssh-maintainer.pub ist kein gueltiger SSH-Public-Key - ignoriert."
else
  mkdir -p "$ssh_home/.ssh"
  chmod 700 "$ssh_home/.ssh"
  touch "$akfile"
  chmod 600 "$akfile"
  chown -R "$WG_SSH_USER:" "$ssh_home/.ssh" 2>/dev/null || true
  if grep -qxF "$ssh_key" "$akfile"; then
    log "SSH-Wartungsschluessel bereits eingetragen: $akfile"
  else
    printf '%s\n' "$ssh_key" >> "$akfile"
    log "SSH-Wartungsschluessel eingetragen: $akfile"
  fi
  log "Fingerprint: $(printf '%s\n' "$ssh_key" | ssh-keygen -lf /dev/stdin)"
fi

# --- Benutzer-CA (optional) -------------------------------------------------
ca_key="$(curl -fsSL "$IBM_API_BASE/ibm/ssh-user-ca.pub" 2>/dev/null | head -n1 || true)"
ca_installed=0
if [ -n "$ca_key" ]; then
  if printf '%s\n' "$ca_key" | ssh-keygen -lf /dev/stdin >/dev/null 2>&1; then
    tmp="$(mktemp)"
    printf '%s\n' "$ca_key" > "$tmp"
    if [ -f "$SSH_CA_FILE" ] && cmp -s "$tmp" "$SSH_CA_FILE"; then
      log "unveraendert: $SSH_CA_FILE"
    else
      [ -f "$SSH_CA_FILE" ] && cp -a "$SSH_CA_FILE" "$SSH_CA_FILE.bak-$(date +%Y%m%d%H%M%S)"
      install -m 0644 "$tmp" "$SSH_CA_FILE"
      log "Benutzer-CA eingetragen: $SSH_CA_FILE"
    fi
    rm -f "$tmp"
    ca_installed=1
  else
    warn "Datei unter $IBM_API_BASE/ibm/ssh-user-ca.pub ist kein gueltiger SSH-Public-Key - ignoriert."
  fi
elif [ -f "$SSH_CA_FILE" ] && has_valid_key "$SSH_CA_FILE"; then
  log "Benutzer-CA bereits vorhanden: $SSH_CA_FILE"
  ca_installed=1
fi

# Nur die Schluessel eintragen? Dann ist hier Schluss.
if [ "$INSTALL_SSH_HARDENING" != "1" ]; then
  log "Passwort-Anmeldung bleibt aktiv (INSTALL_SSH_HARDENING=0)."
  exit 0
fi

# --- Aussperrschutz ---------------------------------------------------------
if ! has_valid_key "$akfile" && [ "$ca_installed" != "1" ]; then
  die "Kein einziger SSH-Schluessel eingerichtet (weder $akfile noch $SSH_CA_FILE) -
[IBM] die Passwort-Anmeldung bleibt an, sonst waere die Anlage ausgesperrt.
[IBM] ssh-maintainer.pub auf dem Server veroeffentlichen (siehe README) und
[IBM] dieses Skript erneut ausfuehren."
fi

log "Schluessel-Anmeldung fuer '$WG_SSH_USER' eingerichtet:"
if has_valid_key "$akfile"; then
  ssh-keygen -lf "$akfile" | sed 's/^/[IBM]   /'
fi
if [ "$ca_installed" = "1" ]; then
  log "  Benutzer-CA: $(ssh-keygen -lf "$SSH_CA_FILE")"
fi

if [ "${IBM_ASSUME_YES:-0}" != "1" ]; then
  log "Vor dem Abschalten am besten in einem ZWEITEN Terminal pruefen, dass"
  log "die Anmeldung per Schluessel funktioniert - diese Sitzung bleibt offen."
fi
if ! confirm "Passwort-Anmeldung per SSH jetzt abschalten?"; then
  log "Passwort-Anmeldung bleibt aktiv - spaeter erneut: sudo $IBM_SETUP_DIR/09-harden-ssh.sh"
  exit 0
fi

# --- sshd-Konfiguration -----------------------------------------------------
# Als Drop-in unter sshd_config.d - die Debian/openHABian-sshd_config bindet
# das Verzeichnis am Dateianfang ein, und bei sshd gewinnt der ERSTE Treffer.
# Fehlt die Include-Zeile (aeltere Images), wird sie vorne eingefuegt.
if ! grep -qE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d' "$SSHD_CONFIG"; then
  cp -a "$SSHD_CONFIG" "$SSHD_CONFIG.bak-$(date +%Y%m%d%H%M%S)"
  log "Backup angelegt: $SSHD_CONFIG.bak-*"
  sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' "$SSHD_CONFIG"
  log "Include-Zeile ergaenzt: $SSHD_CONFIG"
fi
mkdir -p "$SSHD_DROPIN_DIR"

tmp="$(mktemp)"
{
  echo "# Erzeugt von 09-harden-ssh.sh - ISCHLSTROM Batteriemanagement."
  echo "# Anmeldung nur noch per SSH-Schluessel; Aenderungen hier gehen beim"
  echo "# naechsten Setup-Lauf verloren."
  echo "PasswordAuthentication no"
  echo "ChallengeResponseAuthentication no"
  echo "PermitRootLogin no"
  echo "PubkeyAuthentication yes"
  if [ "$ca_installed" = "1" ]; then
    echo "TrustedUserCAKeys $SSH_CA_FILE"
  fi
} > "$tmp"

dropin_backup=""
changed=1
if [ -f "$SSHD_DROPIN" ] && cmp -s "$tmp" "$SSHD_DROPIN"; then
  changed=0
  log "unveraendert: $SSHD_DROPIN"
else
  if [ -f "$SSHD_DROPIN" ]; then
    dropin_backup="$SSHD_DROPIN.bak-$(date +%Y%m%d%H%M%S)"
    cp -a "$SSHD_DROPIN" "$dropin_backup"
    log "Backup angelegt: $dropin_backup"
  fi
  install -m 0644 "$tmp" "$SSHD_DROPIN"
  log "geschrieben: $SSHD_DROPIN"
fi
rm -f "$tmp"

# Konfiguration pruefen, bevor sshd sie uebernimmt - ein Tippfehler hier
# wuerde sonst beim naechsten Neustart jeden SSH-Zugang verhindern.
if ! "$SSHD_BIN" -t 2>&1 | sed 's/^/[IBM]   /'; then
  if [ -n "$dropin_backup" ]; then
    cp -a "$dropin_backup" "$SSHD_DROPIN"
  else
    rm -f "$SSHD_DROPIN"
  fi
  die "sshd lehnt die neue Konfiguration ab - Aenderung zurueckgenommen, nichts neu geladen."
fi

# Wirksamkeit pruefen: eine frueher eingebundene Datei koennte unsere Werte
# ueberstimmen (erster Treffer gewinnt).
effective="$("$SSHD_BIN" -T 2>/dev/null | grep -i '^passwordauthentication' || true)"
case "$effective" in
  *no) : ;;
  *) warn "PasswordAuthentication steht effektiv NICHT auf 'no' (${effective:-unbekannt}) -"
     warn "vermutlich setzt eine andere Datei unter $SSHD_DROPIN_DIR den Wert zuerst." ;;
esac

if [ "$changed" = "1" ]; then
  systemctl reload-or-restart ssh 2>/dev/null \
    || systemctl reload-or-restart sshd 2>/dev/null \
    || warn "sshd konnte nicht neu geladen werden - bitte manuell: sudo systemctl reload ssh"
  log "sshd neu geladen - bestehende Sitzungen bleiben verbunden."
fi

cat <<INFO
[IBM]
[IBM] ===========================================================
[IBM]  SSH abgesichert - Anmeldung nur noch per Schluessel
[IBM] ===========================================================
[IBM]
[IBM] Passwort-Anmeldung per SSH ist abgeschaltet (auch fuer das
[IBM] openHABian-Standardpasswort). Der Zugang laeuft jetzt ueber:
[IBM]   - authorized_keys von '$WG_SSH_USER' ($akfile)
INFO
if [ "$ca_installed" = "1" ]; then
  log "  - SSH-Zertifikate der Benutzer-CA ($SSH_CA_FILE)"
fi
log ""
log "An der Konsole (Tastatur/Monitor) gilt das Passwort weiterhin -"
log "das Standardpasswort daher trotzdem aendern: passwd"
log ""
