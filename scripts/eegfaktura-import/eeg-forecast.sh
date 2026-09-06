#!/bin/bash
# Laeuft auf s1 als postgres (eeg-forecast.service, taeglich 05:30 nach dem
# EEG-Faktura-Import). Rechnet den Prognoselauf neu und speichert ihn in
# metering_energyforecastrun / metering_energyforecast; die Website zeigt
# immer den neuesten Lauf. Laeuft auch, wenn der Import nichts Neues gebracht
# hat oder fehlgeschlagen ist, weil die Wettervorhersage sich taeglich aendert.
# Weitere Argumente gehen an eeg_forecast.py durch.
set -euo pipefail

LIB=/usr/local/lib/eegfaktura-import
PY="$LIB/venv/bin/python"
SCRIPT=/var/lib/eegfaktura-import/forecast/eeg_forecast.py

exec "$PY" "$SCRIPT" --refresh --days 30 --days-ahead 14 --store "$@"
