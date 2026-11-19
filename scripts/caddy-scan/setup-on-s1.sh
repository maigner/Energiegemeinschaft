#!/usr/bin/env bash
# ============================================================================
# Richtet AUF s1 das Caddy-Anfrage-Log und das fail2ban-Jail caddy-scan ein
# (laeuft dort als root; vom Entwicklungsrechner aus starten mit
# ./install-on-s1.sh, das kopiert die Dateien hoch und ruft es auf):
#
#   1. /etc/caddy/requestlog.caddy (Snippet) und die tmpfiles-Regel, die
#      /var/log/caddy/requests.log beim Booten sicherstellt
#   2. Caddyfile: `import requestlog.caddy` und `import requestlog` in jedem
#      Site-Block (caddyfile_requestlog.py). Erst in einer Kopie von
#      /etc/caddy mit `caddy adapt` geprueft, dann mit Sicherung
#      (Caddyfile.bak-<Zeit>) eingesetzt und per `systemctl reload caddy`
#      geladen - schlaegt das fehl, kommt die Sicherung zurueck. Caddy
#      laedt unterbrechungsfrei nach und behaelt bei einem Fehler die alte
#      Konfiguration.
#   3. fail2ban: Filter und Jail caddy-scan. Vor dem Laden `fail2ban-client
#      -t`; faellt der Test durch, wird die Jail-Datei wieder entfernt und
#      das laufende fail2ban nicht angefasst. Geladen wird mit `reload`:
#      bestehende Sperren (sshd, postgresql) bleiben.
#
#   setup-on-s1.sh             alles
#   setup-on-s1.sh --log-only  nur das Anfrage-Log (Schritte 1 und 2) und
#                              der Filter ohne Jail, um erst zu beobachten:
#                              fail2ban-regex /var/log/caddy/requests.log caddy-scan
#
# Wiederholbar - auch nach neuen Sites in der Caddyfile oder fuer Updates
# von Filter und Snippet.
# ============================================================================
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root: sudo $0" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_ONLY=0
[ "${1:-}" = "--log-only" ] && LOG_ONLY=1

CADDY_DIR=/etc/caddy
CADDYFILE="$CADDY_DIR/Caddyfile"
REQLOG=/var/log/caddy/requests.log
JAIL=/etc/fail2ban/jail.d/caddy-scan.conf
FILTER=/etc/fail2ban/filter.d/caddy-scan.conf

log() { echo "[install] $*"; }
die() { echo "[install] FEHLER: $*" >&2; exit 1; }

command -v caddy >/dev/null || die "caddy nicht gefunden"
command -v fail2ban-client >/dev/null || die "fail2ban-client nicht gefunden"
[ -f "$CADDYFILE" ] || die "$CADDYFILE fehlt"
# Ausgangslage muss sauber sein, sonst liesse sich ein Fehler nicht zuordnen
fail2ban-client -t >/dev/null 2>&1 || die "fail2ban-Konfiguration ist schon vor der Aenderung fehlerhaft (fail2ban-client -t)"

# --- 1. + 2. Caddy: erst in einer Kopie pruefen --------------------------------
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -a "$CADDY_DIR/." "$work/"
install -m 0644 "$here/requestlog.caddy" "$work/requestlog.caddy"
python3 "$here/caddyfile_requestlog.py" "$CADDYFILE" > "$work/Caddyfile.new" \
  || die "Caddyfile liess sich nicht ergaenzen - nichts geaendert"
cat "$work/Caddyfile.new" > "$work/Caddyfile"
if ! caddy adapt --config "$work/Caddyfile" --adapter caddyfile >/dev/null 2>"$work/adapt.err"; then
  grep -v 'not formatted' "$work/adapt.err" >&2 || true
  die "caddy nimmt die neue Konfiguration nicht an - nichts geaendert"
fi

install -d -m 0755 /etc/tmpfiles.d
install -m 0644 "$here/caddy-requests.tmpfiles.conf" /etc/tmpfiles.d/caddy-requests.conf
systemd-tmpfiles --create /etc/tmpfiles.d/caddy-requests.conf
[ -e "$REQLOG" ] || die "$REQLOG liess sich nicht anlegen"

backup=""
snippet_backup=""
if [ -f "$CADDY_DIR/requestlog.caddy" ]; then
  snippet_backup="$work/requestlog.caddy.old"
  cp -p "$CADDY_DIR/requestlog.caddy" "$snippet_backup"
fi
install -m 0644 "$here/requestlog.caddy" "$CADDY_DIR/requestlog.caddy"
if ! cmp -s "$CADDYFILE" "$work/Caddyfile.new"; then
  backup="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$CADDYFILE" "$backup"
  cat "$work/Caddyfile.new" > "$CADDYFILE"
  log "Caddyfile ergaenzt, Sicherung: $backup"
else
  log "Caddyfile hat das Anfrage-Log schon in allen Sites."
fi
if ! systemctl reload caddy; then
  if [ -n "$backup" ]; then cat "$backup" > "$CADDYFILE"; fi
  if [ -n "$snippet_backup" ]; then
    cat "$snippet_backup" > "$CADDY_DIR/requestlog.caddy"
  elif [ -n "$backup" ]; then
    rm -f "$CADDY_DIR/requestlog.caddy"
  fi
  systemctl reload caddy || true
  die "caddy reload fehlgeschlagen - alter Stand wiederhergestellt (journalctl -u caddy -n 30)"
fi
log "Caddy neu geladen."

# Kommt etwas an? Eine eigene Anfrage, dann muss die Datei wachsen.
curl -s -o /dev/null --max-time 10 https://ischlstrom.org/ || true
sleep 2
if [ -s "$REQLOG" ]; then
  log "Anfrage-Log schreibt: $(wc -l < "$REQLOG") Zeilen in $REQLOG"
else
  log "ACHTUNG: $REQLOG ist noch leer - journalctl -u caddy -n 30 pruefen."
fi

# Der Filter allein bewirkt nichts, macht aber fail2ban-regex moeglich
install -m 0644 "$here/caddy-scan.filter.conf" "$FILTER"

if [ "$LOG_ONLY" = 1 ]; then
  log "Nur das Anfrage-Log eingerichtet (--log-only). Das Jail kommt mit einem Lauf ohne die Option."
  exit 0
fi

# --- 3. fail2ban ---------------------------------------------------------------
jail_old=""
if [ -f "$JAIL" ]; then jail_old="$work/jail.old"; cp -p "$JAIL" "$jail_old"; fi
install -m 0644 "$here/caddy-scan.jail.conf" "$JAIL"
if ! fail2ban-client -t >"$work/f2b.err" 2>&1; then
  cat "$work/f2b.err" >&2
  if [ -n "$jail_old" ]; then cat "$jail_old" > "$JAIL"; else rm -f "$JAIL"; fi
  die "fail2ban nimmt das Jail nicht an - Jail-Datei zurueckgenommen, fail2ban laeuft unveraendert weiter"
fi
fail2ban-client reload >/dev/null
sleep 2
fail2ban-client status
fail2ban-client status caddy-scan
log "Treffer im bisherigen Log (Probe des Filters):"
fail2ban-regex "$REQLOG" caddy-scan 2>/dev/null | grep -E '^Lines:|^Failregex:' || true
