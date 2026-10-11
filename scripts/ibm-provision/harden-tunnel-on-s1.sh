#!/bin/bash
# Haertung des WireGuard-Wartungstunnels auf s1 (als root ausfuehren).
#
# Hintergrund (Security-Review des Schwesterprojekts Stromkreis, Oktober
# 2026): jeder Pi routet 10.88.0.0/24 durch den Tunnel. Ohne Regeln koennte
# ein uebernommener Pi (oder eine gestohlene SD-Karte mit dem WireGuard-Key)
# ueber s1 die anderen Pis erreichen (SSH 22, openHAB 8080) und auf s1
# selbst alles, was auf allen Adressen lauscht (z. B. Postgres 5432). Der
# Tunnel wird nur in einer Richtung gebraucht: s1 -> Pi (SSH-Sprungpunkt,
# Fernwartung). Die Pis selbst reden mit s1 ausschliesslich ueber die
# oeffentliche HTTPS-Adresse (Status-Push, Provisionierung, Ladefenster).
#
#   harden-tunnel-on-s1.sh --check                      nur Bestandsaufnahme
#   harden-tunnel-on-s1.sh --apply [--workstation-ip X] Regeln setzen (wiederholbar)
#
# --apply setzt per ufw (dauerhaft, unabhaengig von wg-quick):
#   1. ufw route deny in on wg0 out on wg0   kein Forwarding Pi <-> Pi
#   2. ufw deny in on wg0                    nichts vom Tunnel zu Host-Diensten
# und, weil Docker-Portfreigaben an ufw vorbeigehen (DNAT, dann FORWARD ->
# DOCKER-Kette vor den ufw-Ketten):
#   3. iptables -I DOCKER-USER -i wg0 -j DROP  nichts vom Tunnel zu Containern,
#      persistent ueber die oneshot-Unit ibm-tunnel-firewall.service
#      (nach docker.service; Docker leert DOCKER-USER nie).
# Mit --workstation-ip kommt die Workstation in fail2ban ignoreip (Platzhalter
# YOUR.IP.HERE in /etc/fail2ban/jail.local), zusammen mit dem Docker-Netz,
# damit sich der Website-Container nicht mehr selbst aussperrt.
# Docker-Portfreigaben werden nur gemeldet, nie geaendert.
set -euo pipefail

MODE=""
WORKSTATION_IP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check ;;
    --apply) MODE=apply ;;
    --workstation-ip) WORKSTATION_IP="${2:-}"; shift ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$MODE" ] || { sed -n '2,20p' "$0"; exit 2; }
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root (sudo) ausfuehren." >&2; exit 1; }

WG_IF=wg0
WG_SUBNET=10.88.0.0/24
JAIL_LOCAL=/etc/fail2ban/jail.local
findings=0

say()  { printf '%s\n' "$*"; }
ok()   { printf '  [ok]   %s\n' "$*"; }
warn() { printf '  [!!]   %s\n' "$*"; findings=$((findings + 1)); }
info() { printf '  [i]    %s\n' "$*"; }

# ufw-Regeln so, wie "ufw show added" sie ausgibt (als Kommandos)
have_ufw_rule() { ufw show added 2>/dev/null | grep -qF -- "$1"; }

# --- Bestandsaufnahme ----------------------------------------------------------
say "== Tunnel"
if ip link show "$WG_IF" >/dev/null 2>&1; then
  peers="$(wg show "$WG_IF" peers 2>/dev/null | wc -l)"
  ok "$WG_IF vorhanden, $peers Peers"
else
  warn "$WG_IF fehlt - wg-quick@$WG_IF laeuft nicht?"
fi

say "== IP-Forwarding"
fwd="$(cat /proc/sys/net/ipv4/ip_forward)"
if [ "$fwd" = "1" ]; then
  info "net.ipv4.ip_forward=1 (Docker braucht das; Pi<->Pi muss die Firewall unterbinden)"
else
  ok "net.ipv4.ip_forward=0 - kein Forwarding, Pi<->Pi schon dadurch unmoeglich"
fi

say "== ufw"
if ! ufw status 2>/dev/null | grep -q "^Status: active"; then
  warn "ufw ist nicht aktiv - --apply wuerde nichts bewirken (ufw erst mit Bedacht einschalten, SSH-Regel zuerst)"
  UFW_ACTIVE=0
else
  UFW_ACTIVE=1
  ufw status verbose 2>/dev/null | grep -i "^Default:" | sed 's/^/  [i]    /'
  if have_ufw_rule "ufw route deny in on $WG_IF out on $WG_IF"; then
    ok "route deny in on $WG_IF out on $WG_IF (Pi<->Pi gesperrt)"
  else
    warn "keine Forwarding-Sperre $WG_IF -> $WG_IF"
  fi
  if have_ufw_rule "ufw deny in on $WG_IF"; then
    ok "deny in on $WG_IF (Tunnel -> Host-Dienste gesperrt)"
  else
    warn "kein 'deny in on $WG_IF' - vom Tunnel aus gelten die normalen Portregeln"
  fi
fi

say "== Docker-Kette (veroeffentlichte Container-Ports gehen an ufw vorbei)"
if iptables -C DOCKER-USER -i "$WG_IF" -j DROP 2>/dev/null; then
  ok "DOCKER-USER: -i $WG_IF -j DROP aktiv (Tunnel -> Container gesperrt)"
else
  warn "DOCKER-USER ohne Sperre fuer $WG_IF - Docker-Ports (z. B. 3001, 8080, 11000) sind vom Tunnel aus erreichbar"
fi
if systemctl is-enabled ibm-tunnel-firewall.service >/dev/null 2>&1; then
  ok "ibm-tunnel-firewall.service aktiviert (setzt die Regel nach jedem Start neu)"
else
  warn "ibm-tunnel-firewall.service fehlt - die DOCKER-USER-Regel ueberlebt keinen Neustart"
fi

say "== Was ein Pi ueber den Tunnel auf s1 erreichen koennte (lauscht auf allen Adressen oder 10.88.0.1)"
ss -Hltn 2>/dev/null | awk '{print $4}' | grep -E '^(0\.0\.0\.0|\*|\[::\]|10\.88\.0\.1):' | sort -t: -k2 -n -u | sed 's/^/  [i]    /' || true
info "massgeblich ist die ufw-Regel 'deny in on $WG_IF' (oben)"

say "== Docker-Portfreigaben (nur Meldung; alles ausser 127.0.0.1/172.17.0.1 ist von aussen bzw. vom Tunnel aus erreichbar, soweit ufw es zulaesst)"
if command -v docker >/dev/null 2>&1; then
  docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | while IFS=$'\t' read -r name ports; do
    [ -n "$ports" ] || continue
    if printf '%s' "$ports" | grep -qE '(^|, )(0\.0\.0\.0|\[::\]|\*):[0-9]+'; then
      warn "$name: $ports"
    else
      ok "$name: $ports"
    fi
  done
  if docker ps --format '{{.Names}}' | grep -qE 'mongo|redis'; then
    if docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E 'mongo|redis' | grep -qE '0\.0\.0\.0|\[::\]'; then
      warn "MongoDB/Redis der openHAB-Cloud veroeffentlichen einen Host-Port - in der docker-compose.yml (Working Tree auf s1) das ports:-Mapping entfernen"
    else
      ok "MongoDB/Redis der openHAB-Cloud ohne Host-Port (nur im Compose-Netz erreichbar)"
    fi
  fi
else
  info "docker nicht gefunden"
fi

say "== fail2ban"
if [ -f "$JAIL_LOCAL" ]; then
  if grep -q "YOUR.IP.HERE" "$JAIL_LOCAL"; then
    warn "ignoreip in $JAIL_LOCAL enthaelt noch den Platzhalter YOUR.IP.HERE"
  else
    ok "ignoreip: $(grep -E '^\s*ignoreip' "$JAIL_LOCAL" | head -1 | sed 's/^\s*//')"
  fi
else
  info "$JAIL_LOCAL fehlt"
fi

if [ "$MODE" = "check" ]; then
  say ""
  say "Bestandsaufnahme fertig: $findings Punkt(e) offen. Setzen mit: sudo $0 --apply [--workstation-ip <IP>]"
  exit 0
fi

# --- Anwenden --------------------------------------------------------------------
say ""
say "== Anwenden"
[ "$UFW_ACTIVE" = 1 ] || { echo "ufw ist nicht aktiv - Abbruch." >&2; exit 1; }

# Reihenfolge: an Position 1, damit keine spaetere allow-Regel (22, 5432, ...)
# vom Tunnel aus greift. Wiederholbar: vorhandene Regeln werden uebersprungen.
if have_ufw_rule "ufw route deny in on $WG_IF out on $WG_IF"; then
  ok "Forwarding-Sperre schon vorhanden"
else
  ufw route insert 1 deny in on "$WG_IF" out on "$WG_IF" comment "IBM: kein Pi<->Pi ueber den Tunnel"
  ok "ufw route deny in on $WG_IF out on $WG_IF gesetzt"
fi
if have_ufw_rule "ufw deny in on $WG_IF"; then
  ok "Eingangssperre schon vorhanden"
else
  ufw insert 1 deny in on "$WG_IF" comment "IBM: Pis erreichen s1 nur ueber HTTPS, nie durch den Tunnel"
  ok "ufw deny in on $WG_IF gesetzt"
fi

# Docker-Ports: Regel in DOCKER-USER (von Docker fuer eigene Regeln vorgesehen,
# wird nie geleert) plus oneshot-Unit, die sie nach jedem Start wieder setzt.
install -m 0755 /dev/stdin /usr/local/sbin/ibm-tunnel-firewall.sh <<'SH'
#!/bin/bash
# Tunnel -> Container sperren (harden-tunnel-on-s1.sh); wiederholbar.
set -eu
iptables -S DOCKER-USER >/dev/null 2>&1 || iptables -N DOCKER-USER
iptables -C DOCKER-USER -i wg0 -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -i wg0 -j DROP
SH
cat > /etc/systemd/system/ibm-tunnel-firewall.service <<'UNIT'
[Unit]
Description=IBM: Tunnel (wg0) darf keine Docker-Container erreichen
After=docker.service ufw.service
Wants=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/ibm-tunnel-firewall.sh

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now ibm-tunnel-firewall.service >/dev/null
if iptables -C DOCKER-USER -i "$WG_IF" -j DROP 2>/dev/null; then
  ok "DOCKER-USER: -i $WG_IF -j DROP gesetzt, ibm-tunnel-firewall.service aktiviert"
else
  warn "DOCKER-USER-Regel konnte nicht gesetzt werden - journalctl -u ibm-tunnel-firewall"
fi

if [ -n "$WORKSTATION_IP" ] && [ -f "$JAIL_LOCAL" ]; then
  if grep -q "YOUR.IP.HERE" "$JAIL_LOCAL"; then
    cp -a "$JAIL_LOCAL" "$JAIL_LOCAL.bak-$(date +%Y%m%d%H%M%S)"
    sed -i "s|YOUR.IP.HERE|$WORKSTATION_IP 172.16.0.0/12|" "$JAIL_LOCAL"
    systemctl reload fail2ban
    ok "fail2ban ignoreip: Platzhalter durch $WORKSTATION_IP und 172.16.0.0/12 ersetzt, fail2ban neu geladen"
  else
    info "fail2ban ignoreip hat keinen Platzhalter mehr - nicht angefasst: $(grep -E '^\s*ignoreip' "$JAIL_LOCAL" | head -1)"
  fi
fi

say ""
say "== Ergebnis"
ufw status numbered | grep -E "$WG_IF|Status" | sed 's/^/  /'
iptables -S DOCKER-USER | grep -- "-i $WG_IF" | sed 's/^/  DOCKER-USER: /'
cat <<HINWEIS

Pruefung AUF EINEM PI (nicht von der Workstation, die hat keine Route in
den Tunnel und meldet immer "gesperrt"):
  ssh pi-020   # ProxyJump ueber s1, siehe Setup-README "Fernwartung"
  timeout 5 bash -c '</dev/tcp/10.88.0.1/5432' && echo OFFEN || echo gesperrt   # Host-Dienst
  timeout 5 bash -c '</dev/tcp/10.88.0.1/3001' && echo OFFEN || echo gesperrt   # Docker-Port
  timeout 5 bash -c '</dev/tcp/10.88.0.11/22' && echo OFFEN || echo gesperrt    # anderer Pi
Alle drei muessen "gesperrt" melden. Von s1 aus muss SSH zu den Pis weiter gehen:
  ssh openhabian@10.88.0.20 true
Danach eine Statusmeldung abwarten (/board/openhab, "zuletzt gesehen") und
journalctl -t ibm-wg-watchdog auf dem Pi: beides unveraendert.
Rueckbau: sudo ufw status numbered, sudo ufw delete <Nr> (zweimal),
  sudo systemctl disable --now ibm-tunnel-firewall.service,
  sudo iptables -D DOCKER-USER -i $WG_IF -j DROP
HINWEIS
