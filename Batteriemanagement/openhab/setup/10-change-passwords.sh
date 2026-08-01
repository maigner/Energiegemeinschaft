#!/usr/bin/env bash
# ============================================================================
# 10 - Standardpasswoerter aendern
#
# openHABian wird mit allgemein bekannten Standardpasswoertern ausgeliefert:
#
#   Linux-Benutzer 'openhabian'  Passwort 'openhabian' (SSH, Konsole, Samba)
#   Karaf-Konsole  'openhab'     Passwort 'habopen' (userdata/etc/users.properties)
#
# Das neue Linux-Passwort kommt aus IBM_NEW_PASSWORD oder wird interaktiv
# abgefragt; ohne beides bleibt es unveraendert - erraten oder ins Log
# geschrieben wird nichts. Ist Samba eingerichtet, wird das Samba-Passwort
# mitgeaendert. Das Konsolen-Passwort wird zufaellig erzeugt und einmalig
# angezeigt (alternativ IBM_NEW_CONSOLE_PASSWORD); die Konsole ist ohnehin
# nur von localhost erreichbar, und als root laesst es sich in
# users.properties jederzeit neu setzen.
#
# Geaendert wird nur, was noch auf dem Standardwert steht - ein erneuter
# Lauf laesst selbst gesetzte Passwoerter unangetastet (idempotent).
# Passwoerter stehen nie in ibm.conf.
#
# Braucht in ibm.conf: INSTALL_PASSWORD_CHANGE=1
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
load_config

if [ "$INSTALL_PASSWORD_CHANGE" != "1" ]; then
  log "Passwort-Aenderung nicht gewuenscht (INSTALL_PASSWORD_CHANGE=0) - uebersprungen."
  exit 0
fi

PW_USER="${WG_SSH_USER:-openhabian}"
DEFAULT_UNIX_PASSWORD="openhabian"
DEFAULT_CONSOLE_PASSWORD="habopen"
USERS_PROPERTIES="$OPENHAB_USERDATA/etc/users.properties"
JAAS_CFG="$OPENHAB_USERDATA/etc/org.apache.karaf.jaas.cfg"

sha256_upper() { printf '%s' "$1" | sha256sum | cut -d' ' -f1 | tr 'a-z' 'A-Z'; }

# Prueft ueber den Hash in /etc/shadow, ob das Passwort eines Benutzers dem
# uebergebenen Klartext entspricht. Perl statt python3: perl-base ist auf
# Debian immer da, und dessen crypt() kann auch yescrypt ($y$...).
unix_password_is() {
  local user="$1" password="$2" hash
  hash="$(getent shadow "$user" 2>/dev/null | cut -d: -f2)"
  case "$hash" in ''|'!'*|'*') return 1 ;; esac
  perl -e 'my $c = crypt($ARGV[0], $ARGV[1]); exit((defined $c && $c eq $ARGV[1]) ? 0 : 1)' \
    "$password" "$hash"
}

# --- Linux-Benutzer (und Samba) ----------------------------------------------
if ! getent passwd "$PW_USER" >/dev/null; then
  warn "Benutzer '$PW_USER' nicht gefunden - Linux-Passwort uebersprungen."
elif ! unix_password_is "$PW_USER" "$DEFAULT_UNIX_PASSWORD"; then
  log "Linux-Passwort von '$PW_USER' ist nicht mehr das Standardpasswort - unveraendert."
else
  new_password="${IBM_NEW_PASSWORD:-}"
  if [ -n "$new_password" ] && [ "${#new_password}" -lt 8 ]; then
    die "IBM_NEW_PASSWORD ist zu kurz (mindestens 8 Zeichen)."
  fi

  if [ -z "$new_password" ] && [ "${IBM_ASSUME_YES:-0}" != "1" ] && has_tty; then
    log "Neues Passwort fuer den Linux-Benutzer '$PW_USER' festlegen"
    log "(gilt fuer SSH-, Konsolen- und Samba-Anmeldung, mindestens 8 Zeichen)."
    tries=0
    while [ "$tries" -lt 3 ]; do
      read -rs -p "[IBM] Neues Passwort fuer '$PW_USER': " pw1 < /dev/tty || true
      echo
      read -rs -p "[IBM] Wiederholung: " pw2 < /dev/tty || true
      echo
      if [ "$pw1" != "$pw2" ]; then
        warn "Die Eingaben stimmen nicht ueberein."
      elif [ "${#pw1}" -lt 8 ]; then
        warn "Zu kurz (mindestens 8 Zeichen)."
      else
        new_password="$pw1"
        break
      fi
      tries=$((tries + 1))
    done
  fi

  if [ -z "$new_password" ]; then
    warn "Kein neues Passwort (weder Eingabe noch IBM_NEW_PASSWORD) -"
    warn "'$PW_USER' behaelt das Standardpasswort! Spaeter aendern:"
    warn "IBM_NEW_PASSWORD setzen und dieses Skript erneut ausfuehren, oder passwd."
  else
    printf '%s:%s\n' "$PW_USER" "$new_password" | chpasswd
    unix_password_is "$PW_USER" "$new_password" \
      || die "Passwort-Aenderung liess sich nicht verifizieren - bitte pruefen: passwd $PW_USER"
    log "Linux-Passwort von '$PW_USER' geaendert."

    # Samba nur anfassen, wenn der Benutzer dort ueberhaupt eingerichtet ist.
    if command -v smbpasswd >/dev/null 2>&1 && command -v pdbedit >/dev/null 2>&1 \
       && pdbedit -L 2>/dev/null | grep -q "^${PW_USER}:"; then
      if printf '%s\n%s\n' "$new_password" "$new_password" | smbpasswd -s "$PW_USER" >/dev/null 2>&1; then
        log "Samba-Passwort von '$PW_USER' mitgeaendert."
      else
        warn "Samba-Passwort konnte nicht geaendert werden - manuell: sudo smbpasswd $PW_USER"
      fi
    fi
  fi
fi

# --- Karaf-Konsole ------------------------------------------------------------
# Der Eintrag in users.properties lautet "openhab = <passwort>,<rollen>".
# Aeltere openHAB-Versionen speichern das Passwort im Klartext ('habopen'),
# aktuelle als "{CRYPT}<SHA-256 hex, Grossbuchstaben>{CRYPT}" (Vorgabe in
# org.apache.karaf.jaas.cfg: encryption.enabled=true, SHA-256, hexadecimal).
console_current_value() {
  grep -E '^[[:space:]]*openhab[[:space:]]*=' "$USERS_PROPERTIES" 2>/dev/null \
    | head -n1 | cut -d= -f2- | cut -d, -f1 | tr -d '[:space:]'
}

console_is_default() {
  local value
  value="$(console_current_value)"
  [ "$value" = "$DEFAULT_CONSOLE_PASSWORD" ] && return 0
  [ "$value" = "{CRYPT}$(sha256_upper "$DEFAULT_CONSOLE_PASSWORD"){CRYPT}" ] && return 0
  return 1
}

if [ ! -f "$USERS_PROPERTIES" ]; then
  warn "$USERS_PROPERTIES nicht gefunden - Konsolen-Passwort uebersprungen."
elif [ -z "$(console_current_value)" ]; then
  warn "Kein Benutzer 'openhab' in $USERS_PROPERTIES - Konsolen-Passwort uebersprungen."
elif ! console_is_default; then
  log "Karaf-Konsole: Passwort ist nicht mehr das Standardpasswort - unveraendert."
else
  console_password="${IBM_NEW_CONSOLE_PASSWORD:-}"
  if [ -z "$console_password" ]; then
    console_password="$(head -c 512 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 20)"
  fi
  [ "${#console_password}" -ge 8 ] || die "Konsolen-Passwort zu kurz (mindestens 8 Zeichen)."
  case "$console_password" in
    *[!A-Za-z0-9]*) die "IBM_NEW_CONSOLE_PASSWORD darf nur Buchstaben und Ziffern enthalten." ;;
  esac

  # Gespeichert wird im selben Format, das die Anlage schon verwendet:
  # gehasht, wenn die Verschluesselung an ist (SHA-256), sonst Klartext.
  # Bei einem anderen Algorithmus als SHA-256 wird Klartext geschrieben -
  # Karaf verschluesselt den Eintrag dann beim naechsten Start selbst.
  stored_value="$console_password"
  if grep -qE '^[[:space:]]*encryption\.enabled[[:space:]]*=[[:space:]]*true' "$JAAS_CFG" 2>/dev/null \
     && grep -qE '^[[:space:]]*encryption\.algorithm[[:space:]]*=[[:space:]]*SHA-256' "$JAAS_CFG" 2>/dev/null; then
    stored_value="{CRYPT}$(sha256_upper "$console_password"){CRYPT}"
  fi

  cp -a "$USERS_PROPERTIES" "$USERS_PROPERTIES.bak-$(date +%Y%m%d%H%M%S)"
  sed -i -E "s|^([[:space:]]*openhab[[:space:]]*=[[:space:]]*)[^,]*|\1${stored_value}|" \
    "$USERS_PROPERTIES"
  grep -qF "$stored_value" "$USERS_PROPERTIES" \
    || die "users.properties liess sich nicht aktualisieren - Backup liegt daneben."

  cat <<KONSOLE
[IBM]
[IBM] ===========================================================
[IBM]  Neues Passwort der Karaf-Konsole (Benutzer 'openhab')
[IBM]
[IBM]    ${console_password}
[IBM]
[IBM]  Jetzt notieren - es wird nirgends gespeichert. Gebraucht
[IBM]  wird es nur fuer 'openhab-cli console' (nur localhost);
[IBM]  als root jederzeit neu setzbar in:
[IBM]  $USERS_PROPERTIES
[IBM] ===========================================================
[IBM]
KONSOLE
fi

log "Passwort-Pruefung abgeschlossen."
