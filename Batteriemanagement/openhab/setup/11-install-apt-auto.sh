#!/usr/bin/env bash
# ============================================================================
# 11 - Automatische Betriebssystem-Updates (apt)
#
# Der Pi haelt seine Debian- und Raspberry-Pi-Pakete selbst aktuell, ueber
# die Debian-eigene Mechanik (apt-daily.timer, apt-daily-upgrade.timer,
# unattended-upgrades):
#
#   * 02ibm-periodic: taegliches "apt-get update" (damit stimmt auch die
#     Zahl ausstehender Updates im Status-Push) und taeglicher Lauf von
#     unattended-upgrades.
#   * 52ibm-unattended: erlaubte Quellen. Die Debian-Vorgabe
#     (50unattended-upgrades) kennt nur origin=Debian. Auf dem Pi kommen
#     Kernel, Firmware und die rpt-Varianten von libc & Co. aber aus dem
#     Archiv "Raspberry Pi Foundation" - ohne diesen Eintrag lief
#     unattended-upgrades zwar jede Nacht, liess aber genau diese Pakete
#     liegen (Stand 2026-09-17: 43 bis 75 ausstehende Updates je Anlage,
#     fast alle aus diesem Archiv). Dazu <codename>-updates (Punkt-Releases
#     zwischen den Debian-Versionen).
#   * Reboot: Kernel und Firmware wirken erst nach einem Neustart. Steht
#     /run/reboot-required, startet unattended-upgrades den Pi um
#     APT_AUTO_REBOOT_TIME neu (Vorgabe 10:00; APT_AUTO_REBOOT=0 schaltet
#     das ab, dann zeigt nur das Dashboard den ausstehenden Reboot).
#     Bewusst am Vormittag statt in der Nacht: kommt ein Pi nach einem
#     Kernel-Update nicht mehr hoch, faellt das sofort auf (Offline-Alarm
#     der Website nach 30 Minuten) und es ist jemand erreichbar. Waehrend
#     des Neustarts ruht die Steuerung ein paar Minuten: GEN24-Schedules
#     laufen von selbst ab, bei den Modbus-Profilen setzt der Boot-Reset
#     des Fail-Safe (10-install-failsafe.sh) den Wechselrichter zurueck;
#     eine laufende Ladesperre setzt der Kern im naechsten 5-Minuten-Zyklus
#     wieder.
#   * Drop-in fuer apt-daily-upgrade.timer: 03:40 (+ bis zu 20 min) statt
#     der Debian-Vorgabe 06:00 (+ bis zu 60 min) - nach der naechtlichen
#     Paketpruefung von ibm-update (ab 03:00); der Neustart folgt am
#     Vormittag desselben Tages.
#   * 53ibm-jvm-restart: Das Java der Pis kommt aus Debian (openjdk-21) und
#     wird mit aktualisiert. Eine laufende JVM kann danach keine Prozesse
#     mehr starten, weil jspawnhelper nicht mehr zu ihrem Build passt: jedes
#     executeCommandLine schlaegt fehl (Heartbeat, Netzsuche, System-Status),
#     ohne dass openHAB sonst auffaellt (ganze Flotte seit 2026-10-28, bei
#     den Modbus-Anlagen griff deshalb dauerhaft der Fail-Safe). Einen
#     Reboot verlangt das Update nicht. Der Hook startet openHAB neu, sobald
#     die JVM geloeschte Dateien des JDK geladen hat; install-ibm.sh ruft
#     dieselbe Pruefung am Ende auf.
#
# Bewusst NICHT automatisch: openHAB, Java von Adoptium (falls installiert),
# NodeSource, Tailscale, comitup. openHAB-Versionen brauchen den
# Migrationstest im Vorstandsnetz. Was das Dashboard danach noch als
# "ausstehend" zeigt, sind genau diese Pakete.
#
# INSTALL_APT_AUTO=0 in ibm.conf entfernt 52ibm-unattended und das
# Timer-Drop-in wieder (Debian-Vorgabe: nur origin=Debian, kein Reboot);
# 02ibm-periodic bleibt, solange der Status-Push die Update-Zahl meldet.
# Log: /var/log/unattended-upgrades/, journalctl -u apt-daily-upgrade.
# Probelauf von Hand: sudo unattended-upgrade --dry-run -v
# ============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_root
load_config

APT_CONF_DIR=/etc/apt/apt.conf.d
APT_PERIODIC="$APT_CONF_DIR/02ibm-periodic"
APT_UNATTENDED="$APT_CONF_DIR/52ibm-unattended"
TIMER_DROPIN_DIR=/etc/systemd/system/apt-daily-upgrade.timer.d
TIMER_DROPIN="$TIMER_DROPIN_DIR/ibm.conf"
APT_JVM_HOOK="$APT_CONF_DIR/53ibm-jvm-restart"
JVM_CHECK=/usr/local/sbin/ibm-jvm-restart-check

if ! command -v apt-get >/dev/null 2>&1 || [ ! -d "$APT_CONF_DIR" ]; then
  warn "apt-get nicht gefunden - automatische Updates uebersprungen."
  exit 0
fi

remove_apt_auto() {
  if [ -f "$APT_UNATTENDED" ] || [ -f "$TIMER_DROPIN" ]; then
    rm -f "$APT_UNATTENDED" "$TIMER_DROPIN"
    rmdir "$TIMER_DROPIN_DIR" 2>/dev/null || true
    systemctl daemon-reload
    systemctl restart apt-daily-upgrade.timer >/dev/null 2>&1 || true
    log "entfernt: $APT_UNATTENDED und $TIMER_DROPIN"
  fi
}

if [ "$INSTALL_APT_AUTO" != "1" ] && [ "$INSTALL_STATUS_PUSH" != "1" ]; then
  remove_apt_auto
  rm -f "$APT_JVM_HOOK" "$JVM_CHECK"
  log "INSTALL_APT_AUTO=0 - automatische Updates uebersprungen."
  exit 0
fi

case "$APT_AUTO_REBOOT_TIME" in
  [0-2][0-9]:[0-5][0-9]) ;;
  *) die "APT_AUTO_REBOOT_TIME='$APT_AUTO_REBOOT_TIME' ist keine Uhrzeit (HH:MM)." ;;
esac

# openHABian maskiert unattended-upgrades.service, damit waehrend der
# Ersteinrichtung kein apt dazwischenfunkt. Die Updates selbst laufen zwar
# ueber apt-daily-upgrade.timer, der Dienst laesst aber ein gerade laufendes
# Update beim Herunterfahren fertig werden - fuer den Regelbetrieb wird die
# Maskierung deshalb aufgehoben.
systemctl unmask unattended-upgrades.service \
  apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then
  log "Installiere unattended-upgrades (apt-get) ..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -qq unattended-upgrades \
    || warn "unattended-upgrades konnte nicht installiert werden - Updates bleiben Handarbeit."
fi

cat > "$APT_PERIODIC" <<'EOF'
// GENERIERT von IBM (11-install-apt-auto.sh) - nicht direkt bearbeiten.
// Haelt die Paketlisten taeglich aktuell, damit der Status-Push die Zahl
// ausstehender apt-Updates korrekt an das Vorstands-Dashboard meldet, und
// laesst unattended-upgrades taeglich laufen. Welche Quellen es einspielt,
// steht in 52ibm-unattended. Entfernt von purge-ibm.sh.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
chmod 0644 "$APT_PERIODIC"

# Unabhaengig von INSTALL_APT_AUTO: auch die Debian-Vorgabe aktualisiert Java.
# --no-block, damit apt nicht auf den Neustart wartet; ein Fehler hier darf
# einen Update-Lauf nie abbrechen.
cat > "$JVM_CHECK" <<'EOF'
#!/bin/sh
# GENERIERT von IBM (11-install-apt-auto.sh) - nicht direkt bearbeiten.
# Startet openHAB neu, wenn die laufende JVM durch ein Java-Update ersetzte
# Dateien geladen hat (sie kann dann keine Prozesse mehr starten).
pid="$(systemctl show -p MainPID --value openhab.service 2>/dev/null)"
[ -n "$pid" ] && [ "$pid" != "0" ] || exit 0
grep -q '/usr/lib/jvm/.*(deleted)' "/proc/$pid/maps" 2>/dev/null || exit 0
logger -t ibm-jvm-restart "Java wurde aktualisiert - openHAB wird neu gestartet."
systemctl --no-block try-restart openhab.service || true
exit 0
EOF
chmod 0755 "$JVM_CHECK"
cat > "$APT_JVM_HOOK" <<EOF
// GENERIERT von IBM (11-install-apt-auto.sh) - nicht direkt bearbeiten.
// Entfernt von purge-ibm.sh.
DPkg::Post-Invoke { "$JVM_CHECK || true"; };
EOF
chmod 0644 "$APT_JVM_HOOK"

if [ "$INSTALL_APT_AUTO" = "1" ]; then
  if [ "$APT_AUTO_REBOOT" = "1" ]; then reboot=true; else reboot=false; fi
  # Origins-Pattern ist eine Liste: die Eintraege kommen zu denen aus
  # 50unattended-upgrades dazu. ${distro_codename} loest unattended-upgrades
  # selbst auf (daher das quotierte Heredoc bis zur Reboot-Zeile).
  {
    cat <<'EOF'
// GENERIERT von IBM (11-install-apt-auto.sh) - nicht direkt bearbeiten.
// Ergaenzt die Debian-Vorgabe (50unattended-upgrades) um das Archiv der
// Raspberry Pi Foundation (Kernel, Firmware, rpt-Pakete) und um
// <codename>-updates. openHAB, Adoptium-Java, NodeSource, Tailscale und
// comitup bleiben bewusst Handarbeit. Entfernt von purge-ibm.sh.
Unattended-Upgrade::Origins-Pattern {
        "origin=Debian,codename=${distro_codename},label=Debian";
        "origin=Debian,codename=${distro_codename}-updates";
        "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
        "origin=Raspberry Pi Foundation,codename=${distro_codename}";
};
// Ein abgebrochener Lauf (Stromausfall, Reboot) hinterlaesst so hoechstens
// ein halb eingespieltes Paket statt einer halben Update-Welle.
Unattended-Upgrade::MinimalSteps "true";
// Alte Kernel wegraeumen, sonst laeuft /boot/firmware voll.
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
EOF
    echo "// Neustart nur, wenn ein Update ihn verlangt (/run/reboot-required)."
    echo "Unattended-Upgrade::Automatic-Reboot \"$reboot\";"
    echo "Unattended-Upgrade::Automatic-Reboot-WithUsers \"true\";"
    echo "Unattended-Upgrade::Automatic-Reboot-Time \"$APT_AUTO_REBOOT_TIME\";"
  } > "$APT_UNATTENDED"
  chmod 0644 "$APT_UNATTENDED"

  mkdir -p "$TIMER_DROPIN_DIR"
  cat > "$TIMER_DROPIN" <<'EOF'
# Erzeugt von IBM (11-install-apt-auto.sh): Update-Lauf nach der
# naechtlichen Paketpruefung von ibm-update (ab 03:00); der Neustart
# (52ibm-unattended) folgt am Vormittag.
[Timer]
OnCalendar=
OnCalendar=*-*-* 03:40
RandomizedDelaySec=20min
EOF
  chmod 0644 "$TIMER_DROPIN"
  systemctl daemon-reload
else
  remove_apt_auto
fi

systemctl enable --now apt-daily.timer >/dev/null 2>&1 \
  || warn "apt-daily.timer konnte nicht aktiviert werden."
systemctl enable apt-daily-upgrade.timer >/dev/null 2>&1 \
  || warn "apt-daily-upgrade.timer konnte nicht aktiviert werden."
# restart statt enable --now: nur so uebernimmt ein laufender Timer die
# neue Uhrzeit aus dem Drop-in.
systemctl restart apt-daily-upgrade.timer >/dev/null 2>&1 \
  || warn "apt-daily-upgrade.timer konnte nicht gestartet werden."
systemctl enable --now unattended-upgrades.service >/dev/null 2>&1 \
  || warn "unattended-upgrades.service konnte nicht aktiviert werden."

if [ "$INSTALL_APT_AUTO" = "1" ]; then
  if [ "$APT_AUTO_REBOOT" = "1" ]; then
    log "Automatische Updates aktiv (Debian + Raspberry Pi, taeglich ab 03:40; Neustart bei Bedarf um $APT_AUTO_REBOOT_TIME)."
  else
    log "Automatische Updates aktiv (Debian + Raspberry Pi, taeglich ab 03:40; kein automatischer Neustart)."
  fi
else
  log "INSTALL_APT_AUTO=0 - nur taegliches apt-get update und die Debian-Vorgabe von unattended-upgrades ($APT_PERIODIC)."
fi
