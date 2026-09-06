#!/bin/bash
# Installiert den taeglichen EEG-Faktura-Import und den Prognoselauf auf s1
# (vom Entwicklungsrechner aus, wie scripts/ibm-provision/install-on-s1.sh):
# kopiert dieses Verzeichnis plus notebooks/energyData/eegfaktura_import.py
# und notebooks/forecast/eeg_forecast.py nach s1 und fuehrt dort
# setup-on-s1.sh als root aus. sudo auf s1 fragt nach dem Passwort. Wiederholbar - auch fuer
# Updates der beiden Python-Skripte.
#
#   ./install-on-s1.sh
#   S1=benutzer@s1.ischlstrom.org ./install-on-s1.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"

ssh "$S1" 'rm -rf /tmp/eegfaktura-import && mkdir -p /tmp/eegfaktura-import'
scp -q "$here"/eegfaktura-import.sh "$here"/eegfaktura-import.service "$here"/eegfaktura-import.timer \
       "$here"/eeg-forecast.sh "$here"/eeg-forecast.service "$here"/eeg-forecast.timer \
       "$here"/eegfaktura-import.env.example "$here"/setup-on-s1.sh \
       "$repo"/notebooks/energyData/eegfaktura_import.py "$repo"/notebooks/forecast/eeg_forecast.py \
       "$S1:/tmp/eegfaktura-import/"

# LC_ALL=C: s1 hat die Locale des Entwicklungsrechners nicht (Perl-Warnungen)
ssh -t "$S1" '
  export LC_ALL=C &&
  sudo bash /tmp/eegfaktura-import/setup-on-s1.sh &&
  rm -rf /tmp/eegfaktura-import
'

cat <<HINWEIS

Fertig. Zugangsdaten eintragen (einmalig), dann einen Lauf von Hand testen:
  ssh -t $S1 "sudo nano /etc/eegfaktura-import.env"
  ssh -t $S1 "sudo systemctl start eegfaktura-import.service && sudo journalctl -u eegfaktura-import -n 40 --no-pager"
Vorher lohnt ein Vergleichslauf ohne Schreiben (Tag, der schon in der DB liegt):
  ssh -t $S1 "sudo bash -c 'set -a; . /etc/eegfaktura-import.env; runuser -u postgres -- /usr/local/sbin/eegfaktura-import.sh --verify 2026-09-01'"
Prognoselauf einmal von Hand (dauert ein paar Minuten, speichert einen Lauf):
  ssh -t $S1 "sudo systemctl start eeg-forecast.service && sudo journalctl -u eeg-forecast -n 40 --no-pager"
HINWEIS
