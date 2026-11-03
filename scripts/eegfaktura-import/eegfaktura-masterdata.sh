#!/bin/bash
# Laeuft auf s1 als eegimport (eegfaktura-masterdata.service, taeglich 04:40,
# vor dem Energiedaten-Import um 05:00). Umgebung aus /etc/eegfaktura-import.env.
set -euo pipefail

LIB=/usr/local/lib/eegfaktura-import
PY="$LIB/venv/bin/python"

exec "$PY" "$LIB/eegfaktura_masterdata.py" "$@"
