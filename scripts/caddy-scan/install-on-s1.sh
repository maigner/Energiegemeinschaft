#!/bin/bash
# Installiert das Caddy-Anfrage-Log und das fail2ban-Jail caddy-scan auf s1
# (vom Entwicklungsrechner aus, wie scripts/fail2ban-geo/install-on-s1.sh):
# kopiert dieses Verzeichnis nach s1 und fuehrt dort setup-on-s1.sh als root
# aus. sudo auf s1 fragt nach dem Passwort. Wiederholbar.
#
#   ./install-on-s1.sh              Anfrage-Log + Jail
#   ./install-on-s1.sh --log-only   nur das Anfrage-Log (erst beobachten)
#   S1=benutzer@s1.ischlstrom.org ./install-on-s1.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
S1="${S1:-martin@s1.ischlstrom.org}"
opt=""
[ "${1:-}" = "--log-only" ] && opt="--log-only"

ssh "$S1" 'rm -rf /tmp/caddy-scan && mkdir -p /tmp/caddy-scan'
scp -q "$here"/requestlog.caddy "$here"/caddy-requests.tmpfiles.conf \
       "$here"/caddyfile_requestlog.py \
       "$here"/caddy-scan.filter.conf "$here"/caddy-scan.jail.conf \
       "$here"/setup-on-s1.sh \
       "$S1:/tmp/caddy-scan/"

# LC_ALL=C: s1 hat die Locale des Entwicklungsrechners nicht (Perl-Warnungen)
ssh -t "$S1" "
  export LC_ALL=C &&
  sudo bash /tmp/caddy-scan/setup-on-s1.sh $opt &&
  rm -rf /tmp/caddy-scan
"

cat <<HINWEIS

Fertig. Spaeter pruefen:
  ssh -t $S1 "sudo fail2ban-client status caddy-scan"
  ssh -t $S1 "sudo fail2ban-regex /var/log/caddy/requests.log caddy-scan | tail -20"
Entsperren:
  ssh -t $S1 "sudo fail2ban-client set caddy-scan unbanip <Adresse>"
Die Sperren erscheinen mit dem naechsten fail2ban-geo-Lauf auf /board/security.
HINWEIS
