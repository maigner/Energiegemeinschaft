#!/bin/bash
# Laeuft auf s1 als postgres (eegfaktura-import.service, taeglich 05:00).
# Umgebung aus /etc/eegfaktura-import.env (systemd EnvironmentFile).
# Weitere Argumente gehen an das Python-Skript durch (z. B. --verify TAG).
set -euo pipefail

LIB=/usr/local/lib/eegfaktura-import
PY="$LIB/venv/bin/python"

args=()
if [ "${RUN_FORECAST:-0}" = "1" ]; then
  args+=(--forecast)
fi

exec "$PY" "$LIB/eegfaktura_import.py" "${args[@]}" "$@"
