#!/usr/bin/env bash
# ============================================================================
# Richtet den taeglichen EEG-Faktura-Import AUF s1 ein (laeuft dort als root;
# vom Entwicklungsrechner aus starten mit ./install-on-s1.sh, das kopiert
# die Dateien hoch und ruft es auf):
#
#   sudo ./setup-on-s1.sh
#
#   1. venv unter /usr/local/lib/eegfaktura-import/venv mit psycopg,
#      numpy, pandas und scikit-learn (fuer die Prognose)
#   2. Skripte: eegfaktura_import.py nach /usr/local/lib/eegfaktura-import,
#      eeg_forecast.py nach /var/lib/eegfaktura-import/forecast (der Cache
#      liegt daneben, deshalb postgres-eigen), Wrapper nach /usr/local/sbin
#   3. /etc/eegfaktura-import.env aus der Vorlage, falls noch nicht da
#      (Zugangsdaten dort eintragen), .pg_service.conf des Dienstbenutzers
#      (Service eeg-middleware ueber den Socket)
#   4. systemd-Units und Timer aktivieren: eegfaktura-import (05:00) und
#      eeg-forecast (05:30, Prognoselauf, unabhaengig vom Import)
#
# Der Dienst laeuft als Systembenutzer eegimport, der per pg_ident auf die
# DB-Rolle ischlstrom_middleware abgebildet wird (peer-Auth am Socket): die
# Rolle gehoert die Tabellen und Materialized Views, darf also auffrischen -
# mehr nicht. Bis Oktober 2026 lief der Dienst als postgres (Superuser) und
# parste dabei JSON einer fremden API mit ungepinnten PyPI-Paketen
# (Security-Audit 2026-10-11). Wiederholbar.
# ============================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root: sudo $0" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB=/usr/local/lib/eegfaktura-import
VAR=/var/lib/eegfaktura-import
ENV_FILE=/etc/eegfaktura-import.env
SVC_USER=eegimport
DB_ROLE=ischlstrom_middleware

log() { echo "[install] $*"; }

# --- 1. venv -------------------------------------------------------------------
if ! python3 -c 'import venv, ensurepip' 2>/dev/null; then
  log "python3-venv installieren"
  apt-get install -y -q python3-venv
fi
install -d -m 0755 "$LIB"
if [ ! -x "$LIB/venv/bin/python" ]; then
  log "venv anlegen"
  python3 -m venv "$LIB/venv"
fi
"$LIB/venv/bin/pip" install -q --upgrade pip
"$LIB/venv/bin/pip" install -q 'psycopg[binary]>=3.1'
log "Prognose-Pakete installieren (beim ersten Mal dauert das)"
"$LIB/venv/bin/pip" install -q numpy pandas scikit-learn

# --- 1b. Dienstbenutzer + peer-Abbildung ----------------------------------------
if ! getent passwd "$SVC_USER" >/dev/null; then
  log "Systembenutzer $SVC_USER anlegen"
  useradd --system --home-dir "$VAR" --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
install -d -m 0750 -o "$SVC_USER" -g "$SVC_USER" "$VAR"
pg_sql() { runuser -u postgres -- psql -qAt -v ON_ERROR_STOP=1 "$@"; }
ident_file="$(pg_sql -c 'show ident_file')"
hba_file="$(pg_sql -c 'show hba_file')"
reload=0
if ! grep -qE "^eegimport[[:space:]]+$SVC_USER[[:space:]]+$DB_ROLE\b" "$ident_file"; then
  printf '# EEG-Faktura-Import/Prognose: OS-Benutzer %s -> DB-Rolle %s (setup-on-s1.sh)\neegimport  %s  %s\n' \
    "$SVC_USER" "$DB_ROLE" "$SVC_USER" "$DB_ROLE" >> "$ident_file"
  log "$ident_file: Abbildung $SVC_USER -> $DB_ROLE eingetragen."
  reload=1
fi
hba_line="local   ischlstrom_middleware   $DB_ROLE   peer map=eegimport"
if ! grep -qF "map=eegimport" "$hba_file"; then
  # vor allen anderen Regeln, damit die allgemeine local-peer-Regel nicht zuerst greift
  tmp_hba="$(mktemp)"
  { echo "# EEG-Faktura-Import (setup-on-s1.sh): $SVC_USER am Socket als $DB_ROLE"; echo "$hba_line"; cat "$hba_file"; } > "$tmp_hba"
  install -m 0640 -o postgres -g postgres "$tmp_hba" "$hba_file"
  rm -f "$tmp_hba"
  log "$hba_file: Regel fuer $SVC_USER vorangestellt."
  reload=1
fi
if [ "$reload" = 1 ]; then
  pg_sql -c 'select pg_reload_conf()' >/dev/null
  log "PostgreSQL-Konfiguration neu geladen."
fi
if ! runuser -u "$SVC_USER" -- psql -qAt -d ischlstrom_middleware -U "$DB_ROLE" -c 'select current_user' 2>/dev/null | grep -qx "$DB_ROLE"; then
  echo "[install] FEHLER: $SVC_USER kann sich nicht als $DB_ROLE am Socket anmelden - pg_hba/pg_ident pruefen." >&2
  exit 1
fi

# --- 2. Dateien ----------------------------------------------------------------
install -m 0644 "$here/eegfaktura_import.py" "$LIB/eegfaktura_import.py"
install -m 0755 "$here/eegfaktura-import.sh" /usr/local/sbin/eegfaktura-import.sh
install -m 0644 "$here/eegfaktura-import.service" /etc/systemd/system/eegfaktura-import.service
install -m 0644 "$here/eegfaktura-import.timer" /etc/systemd/system/eegfaktura-import.timer
install -m 0755 "$here/eeg-forecast.sh" /usr/local/sbin/eeg-forecast.sh
install -m 0644 "$here/eeg-forecast.service" /etc/systemd/system/eeg-forecast.service
install -m 0644 "$here/eeg-forecast.timer" /etc/systemd/system/eeg-forecast.timer
install -d -m 0750 -o "$SVC_USER" -g "$SVC_USER" "$VAR/forecast"
chown -R "$SVC_USER:$SVC_USER" "$VAR"
install -m 0644 -o "$SVC_USER" -g "$SVC_USER" "$here/eeg_forecast.py" "$VAR/forecast/eeg_forecast.py"

# --- 3. Konfiguration ----------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  install -m 0600 "$here/eegfaktura-import.env.example" "$ENV_FILE"
  log "$ENV_FILE angelegt - FAKTURA_USER, FAKTURA_PASSWORD, RC_NUMBER, EC_ID eintragen."
fi
chmod 0600 "$ENV_FILE"
# Alte Vorlage (Dienst lief als postgres): DSN ohne user= -> libpq nimmt den
# OS-Benutzer eegimport als Rolle. Nachziehen.
if grep -qE '^EEG_DB_DSN=.*dbname=' "$ENV_FILE" && ! grep -qE '^EEG_DB_DSN=.*user=' "$ENV_FILE"; then
  sed -i -E "s/^(EEG_DB_DSN=.*)$/\1 user=$DB_ROLE/" "$ENV_FILE"
  log "$ENV_FILE: EEG_DB_DSN um user=$DB_ROLE ergaenzt."
fi
if [ ! -f "$VAR/.pg_service.conf" ] || ! grep -q "^user=$DB_ROLE" "$VAR/.pg_service.conf"; then
  cat > "$VAR/.pg_service.conf" <<CONF
[eeg-middleware]
dbname=ischlstrom_middleware
user=$DB_ROLE
CONF
  chown "$SVC_USER:$SVC_USER" "$VAR/.pg_service.conf"
  chmod 0600 "$VAR/.pg_service.conf"
  log "$VAR/.pg_service.conf: Service eeg-middleware (Socket, Rolle $DB_ROLE) eingetragen."
fi

# --- 4. Timer ------------------------------------------------------------------
systemctl daemon-reload
systemctl enable --now eegfaktura-import.timer eeg-forecast.timer
log "Timer aktiv:"
systemctl list-timers eegfaktura-import.timer eeg-forecast.timer --no-pager

if ! grep -q '^FAKTURA_PASSWORD=.\+' "$ENV_FILE"; then
  log "ACHTUNG: FAKTURA_PASSWORD in $ENV_FILE ist leer; der Lauf bricht bis dahin mit Exit 2 ab."
fi
