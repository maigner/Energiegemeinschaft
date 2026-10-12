#!/bin/bash
# Fuehrt harden-tunnel-on-s1.sh auf s1 aus (vom Entwicklungsrechner, wie
# install-on-s1.sh): kopiert das Skript und startet es dort mit sudo.
#
#   ./harden-tunnel.sh --check
#   ./harden-tunnel.sh --apply --workstation-ip 85.127.80.137
#   S1=benutzer@s1.ischlstrom.org ./harden-tunnel.sh --check
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"
[ $# -gt 0 ] || { echo "Aufruf: $0 --check | --apply [--workstation-ip <IP>]" >&2; exit 2; }

scp -q "$here/harden-tunnel-on-s1.sh" "$S1:/tmp/harden-tunnel-on-s1.sh"
# LC_ALL=C: s1 hat die Locale des Entwicklungsrechners nicht
ssh -t "$S1" "export LC_ALL=C && sudo bash /tmp/harden-tunnel-on-s1.sh $* ; rc=\$?; rm -f /tmp/harden-tunnel-on-s1.sh; exit \$rc"
