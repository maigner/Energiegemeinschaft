#!/bin/bash
# Laeuft auf s1 als eegimport (eegfaktura-import.service, taeglich 05:00; DB-Rolle
# ischlstrom_middleware ueber peer-Auth, siehe setup-on-s1.sh).
# Umgebung aus /etc/eegfaktura-import.env (systemd EnvironmentFile).
# Weitere Argumente gehen an das Python-Skript durch (z. B. --verify TAG).
# Die Prognose rechnet danach eeg-forecast.service (05:30) unabhaengig davon,
# ob der Import etwas Neues gebracht hat.
set -euo pipefail

LIB=/usr/local/lib/eegfaktura-import
PY="$LIB/venv/bin/python"

exec "$PY" "$LIB/eegfaktura_import.py" "$@"
