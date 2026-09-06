#!/usr/bin/env bash
# ============================================================================
# Richtet den taeglichen EEG-Faktura-Import AUF s1 ein (laeuft dort als root;
# vom Entwicklungsrechner aus starten mit ./install-on-s1.sh, das kopiert
# die Dateien hoch und ruft es auf):
#
#   sudo ./setup-on-s1.sh
#
#   1. venv unter /usr/local/lib/eegfaktura-import/venv mit psycopg
#      (plus numpy/pandas/scikit-learn, wenn RUN_FORECAST=1 in der env-Datei)
#   2. Skripte: eegfaktura_import.py nach /usr/local/lib/eegfaktura-import,
#      eeg_forecast.py nach /var/lib/eegfaktura-import/forecast (der Cache
#      liegt daneben, deshalb postgres-eigen), Wrapper nach /usr/local/sbin
#   3. /etc/eegfaktura-import.env aus der Vorlage, falls noch nicht da
#      (Zugangsdaten dort eintragen), ~postgres/.pg_service.conf fuer die
#      Prognose (Service eeg-middleware ueber den Socket)
#   4. systemd-Unit und Timer aktivieren
#
# Der Dienst laeuft als postgres (peer-Auth am Socket, darf die Materialized
# Views auffrischen, die ischlstrom_middleware gehoeren). Wiederholbar.
# ============================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root: sudo $0" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB=/usr/local/lib/eegfaktura-import
VAR=/var/lib/eegfaktura-import
ENV_FILE=/etc/eegfaktura-import.env
PG_HOME="$(getent passwd postgres | cut -d: -f6)"

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

# --- 2. Dateien ----------------------------------------------------------------
install -m 0644 "$here/eegfaktura_import.py" "$LIB/eegfaktura_import.py"
install -m 0755 "$here/eegfaktura-import.sh" /usr/local/sbin/eegfaktura-import.sh
install -m 0644 "$here/eegfaktura-import.service" /etc/systemd/system/eegfaktura-import.service
install -m 0644 "$here/eegfaktura-import.timer" /etc/systemd/system/eegfaktura-import.timer
install -d -m 0755 -o postgres -g postgres "$VAR" "$VAR/forecast"
install -m 0644 -o postgres -g postgres "$here/eeg_forecast.py" "$VAR/forecast/eeg_forecast.py"

# --- 3. Konfiguration ----------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  install -m 0600 "$here/eegfaktura-import.env.example" "$ENV_FILE"
  log "$ENV_FILE angelegt - FAKTURA_USER, FAKTURA_PASSWORD, RC_NUMBER, EC_ID eintragen."
fi
chmod 0600 "$ENV_FILE"
if grep -q '^RUN_FORECAST=1' "$ENV_FILE"; then
  log "Prognose-Pakete installieren (dauert)"
  "$LIB/venv/bin/pip" install -q numpy pandas scikit-learn
fi
if [ ! -f "$PG_HOME/.pg_service.conf" ] || ! grep -q '^\[eeg-middleware\]' "$PG_HOME/.pg_service.conf"; then
  cat >> "$PG_HOME/.pg_service.conf" <<'CONF'
[eeg-middleware]
dbname=ischlstrom_middleware
CONF
  chown postgres:postgres "$PG_HOME/.pg_service.conf"
  chmod 0600 "$PG_HOME/.pg_service.conf"
  log "$PG_HOME/.pg_service.conf: Service eeg-middleware (Socket) eingetragen."
fi

# --- 4. Timer ------------------------------------------------------------------
systemctl daemon-reload
systemctl enable --now eegfaktura-import.timer
log "Timer aktiv:"
systemctl list-timers eegfaktura-import.timer --no-pager

if ! grep -q '^FAKTURA_PASSWORD=.\+' "$ENV_FILE"; then
  log "ACHTUNG: FAKTURA_PASSWORD in $ENV_FILE ist leer; der Lauf bricht bis dahin mit Exit 2 ab."
fi
