#!/usr/bin/env bash
# ============================================================================
# Wechselrichter-Profil: Deye Hybrid (SG04LP3/SG05LP3, Modbus)
#
# Deye-Niedervolt-Hybride, 3-phasig (SUN-5K..20K-SG04LP3-EU bzw.
# SG05LP3-EU, baugleich u. a. als Sunsynk vertrieben). Die Geraete sprechen
# NUR Modbus RTU ueber RS485 - der Solarman-WLAN-Stick kapselt das in ein
# proprietaeres Protokoll, das das openHAB-Modbus-Binding nicht versteht.
# Angebunden wird deshalb ein RS485-Ethernet-Gateway (z. B. Waveshare
# "RS485 TO ETH") im Modus "Modbus TCP <-> RTU", Port 502; die IP der
# Bridge ist also die des GATEWAYS, nicht die des Wechselrichters.
# Serielle Einstellungen am Gateway: 9600 Baud, 8N1, Slave-ID 1.
#
# Gesteuert wird ueber den Time-of-Use-Verkaufsfahrplan (TOU) der
# proprietaeren Deye-Registerkarte: 6 Tages-Slots mit je Leistung, Ziel-SoC
# und Netz-/Generator-Ladeflag. Der Adapter beschreibt alle 6 Slots
# identisch - die Slot-Zeitgrenzen bleiben unangetastet und sind damit egal:
#   - Ladesperre:            TOU an + Slot-Leistung 0 (Batterie bleibt
#                            unbeteiligt, PV versorgt Haushalt und Netz)
#   - forcierte Entladung:   TOU an + Slot-Leistung in W + Ziel-SoC auf
#                            der Entladeuntergrenze
#   - Ruecksetzen:           TOU aus (146 = 0), die Anlage folgt wieder
#                            ihrem Grundmodus (Eigenverbrauch)
#
# Voraussetzungen an der Anlage:
#   - Grundmodus Eigenverbrauch OHNE eigenen TOU-Zeitplan des Mitglieds -
#     IBM ueberschreibt die Slot-Werte (Leistung/SoC/Flags) dauerhaft!
#   - Einspeisen erlaubt: Work Mode "Selling first" (142 = 0) und
#     "Solar Sell" aktiv - sonst deckt die forcierte Entladung nur den
#     Hausverbrauch.
#
# Die Registeradressen unten stammen aus den Community-Registerkarten der
# 3-phasigen Niedervolt-Familie (deye-inverter-mqtt, home_assistant_solarman,
# deye-controller; die offizielle Deye-Doku ist nicht frei verfuegbar) und
# sind NICHT am Geraet verifiziert. VOR DER ERSTEN INSTALLATION am Geraet
# verifizieren (Spike, siehe README.md in diesem Verzeichnis). Der Adapter
# weigert sich zu steuern, solange die Plausibilitaetspruefung (Work Mode
# und TOU-Register lesbar und plausibel) nicht besteht.
# ============================================================================

# Anzeigename im Assistenten
INVERTER_LABEL="Deye Hybrid (SG04LP3/SG05LP3, Modbus)"

# Addons fuer addons.cfg (Kategorie binding)
INVERTER_BINDINGS="modbus"

# Praefix, unter dem bestehende Things erkannt werden (manueller Weg)
INVERTER_THING_PREFIX="modbus:data"

# Haupt-Thing der automatischen Einrichtung: das SoC-Data-Thing. Das
# Segment ":ibm:" markiert es als von IBM verwaltet (03-install-items.sh),
# und 02b wartet darauf, dass es ONLINE geht.
INVERTER_AUTO_THING_UID="modbus:data:ibm:dy:soc"

# Wechselrichter-Adapter (Adapter-Kontrakt siehe control/core.js)
INVERTER_ADAPTER_SCRIPT="inverters/deye/adapter.js"

# Standardname des Ladestands-Items; zugleich der Platzhalter, den Setup
# und Overview-Seiten durch das konfigurierte Item ersetzen.
INVERTER_SOC_PLACEHOLDER="IBM_DY_SoC"

# Batterieleistungs-Karte: die Batterieleistung (590) ist direkt lesbar.
# Vorzeichen im Spike pruefen (MODBUS_BATT_POWER_GAIN unten).
INVERTER_BATTERY_POWER_PLACEHOLDER="IBM_DY_BatteryPower"

# Thing mit der Netzwerkadresse (die Modbus-TCP-Bridge, sprich: das
# RS485-Gateway) und deren Adress-Parameter
INVERTER_HOST_THING_PREFIX="modbus:tcp"
INVERTER_HOST_PARAM="host"

# Netzwerksuche fuer den Watchdog: Modbus-Probe auf das Work-Mode-Register.
# Gefunden wird das GATEWAY - zieht das Gateway per DHCP um, findet die
# Suche es wieder; der RS485-Strang dahinter bleibt davon unberuehrt.
INVERTER_REDISCOVER_SCRIPT="inverters/deye/rediscover.sh"

# Keine Zugangsdaten noetig - Modbus TCP kennt keine Anmeldung.
# (INVERTER_USER_PARAM bleibt leer, der Assistent fragt nichts ab.)

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="Der Wechselrichter braucht ein RS485-Ethernet-Gateway im Modus 'Modbus TCP', Port 502, seriell 9600 8N1 (die IP-Adresse ist die des Gateways). Die Anlage muss im Grundmodus Eigenverbrauch OHNE eigenen TOU-Zeitplan laufen und einspeisen duerfen (Work Mode 'Selling first', 'Solar Sell' aktiv). Registerkarte vor der ersten Installation am Geraet verifizieren - siehe inverters/deye/README.md."

# --- Modbus-Registerkarte (3-phasige Niedervolt-Familie) ---------------------
# Deye adressiert literal und 0-basiert (Registeradresse 588 = Adresse 588
# im Request), gelesen wird per FC03 (Holding-Register), geschrieben mit
# FC06/FC16. IM SPIKE VERIFIZIEREN - siehe README.md.
#
#   142      Work Mode              U16  0 = Selling first,
#                                        1 = Zero export to load,
#                                        2 = Zero export to CT
#   143      Max sell power         U16  W (Spike: manche Firmwares W*10)
#   145      Solar Sell             U16  0/1
#   146      Time of Use enable     U16  Spike: 0/1 oder Tages-Bitmaske
#   148-153  TOU Slot 1-6 Beginn    U16  Uhrzeit als HHMM (z. B. 2000)
#   154-159  TOU Slot 1-6 Leistung  U16  W
#   160-165  TOU Slot 1-6 Spannung  U16  (nur Spannungs-Batterien, ungenutzt)
#   166-171  TOU Slot 1-6 Ziel-SoC  U16  %
#   172-177  TOU Slot 1-6 Flags     U16  Bit 0 Netzladen, Bit 1 Gen-Laden
#   587      Batteriespannung       U16  Gain 0.01 -> V (ungenutzt)
#   588      Batterie-SoC           U16  %
#   590      Batterieleistung       S16  W (Vorzeichen im Spike pruefen)
MODBUS_UNIT_ID="${MODBUS_UNIT_ID:-1}"

# TCP-Port des RS485-Gateways (Vorgabe 502; am Gateway konfigurierbar)
MODBUS_PORT="${MODBUS_PORT:-502}"

# Skalierung des Ladestands: Registerwert 55 = 55 % -> Gain 1
MODBUS_SOC_GAIN="${MODBUS_SOC_GAIN:-1}"

# Vorzeichendreher fuer die Batterieleistung. IBM-Karte: + entladen.
# Annahme: Deye meldet + = entladen (Gain 1); meldet das Geraet + = laden,
# im Spike auf -1 stellen.
MODBUS_BATT_POWER_GAIN="${MODBUS_BATT_POWER_GAIN:-1}"

# Thing-Baum der automatischen Einrichtung: tcp-Bridge (das Gateway) ->
# zwei Poller (Einstellungen/TOU, Batteriewerte) -> Data-Things je Register.
# Reihenfolge = Anlegereihenfolge.
inverter_things_json() {
  IBM_J_HOST="${INVERTER_HOST:-}" \
  IBM_J_PORT="$MODBUS_PORT" \
  IBM_J_UNIT_ID="$MODBUS_UNIT_ID" \
  IBM_J_LABEL="$INVERTER_LABEL" \
  python3 - <<'PY'
import json, os
e = os.environ
label = e["IBM_J_LABEL"]

things = [
    {
        "UID": "modbus:tcp:ibm",
        "thingTypeUID": "modbus:tcp",
        "label": label + " (Verbindung)",
        "configuration": {
            "host": e["IBM_J_HOST"],
            "port": int(e["IBM_J_PORT"]),
            "id": int(e["IBM_J_UNIT_ID"]),
        },
    },
]

# Poller: id, Start, Laenge, Refresh in ms. Typ "holding" - Deye liest
# alle Register per FC03.
pollers = [
    ("dysett", 142, 36, 30000),   # 142..177: Work Mode, Sell, TOU-Slots
    ("dybatt", 587, 4,  10000),   # 587..590: Batteriespannung, SoC, Leistung
]
for poller_id, start, length, refresh in pollers:
    things.append({
        "UID": "modbus:poller:ibm:" + poller_id,
        "thingTypeUID": "modbus:poller",
        "bridgeUID": "modbus:tcp:ibm",
        "label": label + " (" + poller_id + ")",
        "configuration": {
            "start": start,
            "length": length,
            "type": "holding",
            "refresh": refresh,
        },
    })

# id, Poller, Adresse, Wertetyp, beschreibbar?
registers = [
    ("workmode",  "dysett", 142, "uint16", False),  # 0 = Selling first
    ("maxsell",   "dysett", 143, "uint16", False),  # Obergrenze Einspeisung W
    ("solarsell", "dysett", 145, "uint16", False),  # PV-Einspeisung erlaubt
    ("touenable", "dysett", 146, "uint16", True),   # TOU an/aus
]
for i in range(6):
    registers.append(("sellt" + str(i + 1), "dysett", 148 + i, "uint16", False))
for i in range(6):
    registers.append(("sellw" + str(i + 1), "dysett", 154 + i, "uint16", True))
for i in range(6):
    registers.append(("sellsoc" + str(i + 1), "dysett", 166 + i, "uint16", True))
for i in range(6):
    registers.append(("sellflag" + str(i + 1), "dysett", 172 + i, "uint16", True))
registers += [
    ("soc",       "dybatt", 588, "uint16", False),  # Ladestand %
    ("battpower", "dybatt", 590, "int16",  False),  # Batterieleistung W
]
for reg_id, poller_id, address, valuetype, writable in registers:
    cfg = {
        "readStart": str(address),
        "readValueType": valuetype,
    }
    if writable:
        cfg["writeStart"] = str(address)
        cfg["writeValueType"] = valuetype
        cfg["writeType"] = "holding"
    things.append({
        "UID": "modbus:data:ibm:dy:" + reg_id,
        "thingTypeUID": "modbus:data",
        "bridgeUID": "modbus:poller:ibm:" + poller_id,
        "label": label + " (" + reg_id + ")",
        "configuration": cfg,
    })

print(json.dumps(things))
PY
}

# Items der automatischen Einrichtung. SoC und Batterieleistung werden ueber
# das gainOffset-Profil des Modbus-Bindings skaliert; die Registeritems
# bleiben roh - der Adapter rechnet selbst (und schreibt Rohwerte zurueck).
inverter_battery_items() {
  cat <<EOF
Number ${SOC_ITEM} "Ladestand Batterie [%.0f %%]" <batterylevel> (IBM) { channel="modbus:data:ibm:dy:soc:number" [profile="modbus:gainOffset", gain="${MODBUS_SOC_GAIN}", pre-gain-offset="0"] }
Number ${BATTERY_POWER_ITEM:-IBM_DY_BatteryPower} "Einspeiseleistung Batterie [%.0f W]" <energy> (IBM) { channel="modbus:data:ibm:dy:battpower:number" [profile="modbus:gainOffset", gain="${MODBUS_BATT_POWER_GAIN}", pre-gain-offset="0"] }

// Modbus-Register (roh) - vom Adapter gelesen bzw. beschrieben
Number IBM_DY_WorkMode  "Work Mode [%.0f]"                <settings> (IBM) { channel="modbus:data:ibm:dy:workmode:number" }
Number IBM_DY_MaxSellW  "Max. Verkaufsleistung [%.0f W]"  <settings> (IBM) { channel="modbus:data:ibm:dy:maxsell:number" }
Number IBM_DY_SolarSell "Solar Sell [%.0f]"               <settings> (IBM) { channel="modbus:data:ibm:dy:solarsell:number" }
Number IBM_DY_TouEnable "TOU aktiv [%.0f]"                <switch>   (IBM) { channel="modbus:data:ibm:dy:touenable:number" }
EOF
  local i
  for i in 1 2 3 4 5 6; do
    cat <<EOF
Number IBM_DY_SellT${i}    "TOU Slot ${i} Beginn [%.0f]"          <time>     (IBM) { channel="modbus:data:ibm:dy:sellt${i}:number" }
Number IBM_DY_SellW${i}    "TOU Slot ${i} Leistung [%.0f W]"      <settings> (IBM) { channel="modbus:data:ibm:dy:sellw${i}:number" }
Number IBM_DY_SellSoc${i}  "TOU Slot ${i} Ziel-SoC [%.0f %%]"     <settings> (IBM) { channel="modbus:data:ibm:dy:sellsoc${i}:number" }
Number IBM_DY_SellFlag${i} "TOU Slot ${i} Netz/Gen-Laden [%.0f]"  <settings> (IBM) { channel="modbus:data:ibm:dy:sellflag${i}:number" }
EOF
  done
}

# Sucht Deye-Gateways im eigenen /24-Netz: Modbus-FC03-Probe auf das
# Work-Mode-Register (142) an Slave MODBUS_UNIT_ID; als Treffer zaehlt nur
# eine Antwort mit plausiblem Wert (0-2). Eine IP je Zeile.
inverter_scan_hosts() {
  local own_cidr base
  own_cidr="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4; exit}')"
  [ -n "$own_cidr" ] || return 0
  base="${own_cidr%/*}"; base="${base%.*}"
  IBM_SCAN_BASE="$base" IBM_SCAN_UNIT="$MODBUS_UNIT_ID" IBM_SCAN_PORT="$MODBUS_PORT" python3 - <<'PY'
import concurrent.futures, os, socket, struct

base = os.environ["IBM_SCAN_BASE"]
unit = int(os.environ["IBM_SCAN_UNIT"])
port = int(os.environ["IBM_SCAN_PORT"])

def probe(ip):
    try:
        s = socket.create_connection((ip, port), timeout=1)
        s.settimeout(1.5)
        # MBAP (TID 1, Laenge 6, Unit) + PDU: FC03, Adresse 142, 1 Register
        s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
                  + struct.pack(">BHH", 3, 142, 1))
        resp = s.recv(256)
        s.close()
        # Antwort: MBAP (7 Byte) + FC (1) + Bytezahl (1) + Daten (2)
        if len(resp) >= 11 and resp[6] == unit and resp[7] == 3:
            value = struct.unpack(">H", resp[9:11])[0]
            if value <= 2:
                return ip
    except OSError:
        pass
    return None

ips = [base + "." + str(i) for i in range(1, 255)]
with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
    for ip in pool.map(probe, ips):
        if ip:
            print(ip)
PY
}

# Zusaetzliche Pruefungen fuer 06-verify.sh: alle Things des Baums ONLINE,
# Work Mode plausibel (sonst zeigen die Adressen ins Leere oder es antwortet
# das falsche Geraet) und der Ladestand im Wertebereich. Ein bereits aktiver
# TOU-Zeitplan wird gemeldet (IBM ueberschreibt dessen Slot-Werte).
inverter_verify() {
  local ok=0 uid status
  case "${OH_API_TOKEN:-}" in
    oh.*) ;;
    *) log "Kein API-Token - Modbus-Thing-Status nicht pruefbar."; return 0 ;;
  esac
  while IFS= read -r uid; do
    [ -n "$uid" ] || continue
    status="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
        "http://127.0.0.1:8080/rest/things/$uid/status" 2>/dev/null \
      | grep -o '"status"[[:space:]]*:[[:space:]]*"[A-Z]*"' | head -n1 \
      | sed -e 's/.*"\([A-Z]*\)"$/\1/' || true)"
    if [ "$status" = "ONLINE" ]; then
      log "Modbus-Thing ONLINE: $uid"
    else
      warn "Modbus-Thing nicht ONLINE (${status:-unbekannt}): $uid"
      ok=1
    fi
  done < <(inverter_things_json | python3 -c 'import json,sys
for t in json.load(sys.stdin): print(t["UID"])')

  local mode
  mode="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/items/IBM_DY_WorkMode/state" 2>/dev/null || true)"
  mode="${mode%% *}"; mode="${mode%.*}"
  case "$mode" in
    0|1|2)
      log "Work Mode plausibel: $mode."
      if [ "$mode" != "0" ]; then
        warn "Work Mode ist nicht 'Selling first' (0) - forcierte Entladung deckt nur den Hausverbrauch."
      fi ;;
    NULL|UNDEF|"")
      warn "Work Mode noch ohne Wert - Poller schon gelaufen?"; ok=1 ;;
    *)
      warn "Work Mode unlesbar/unplausibel ('$mode') - Registerkarte/Slave-Adresse pruefen (README)."; ok=1 ;;
  esac

  local tou
  tou="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/items/IBM_DY_TouEnable/state" 2>/dev/null || true)"
  tou="${tou%% *}"; tou="${tou%.*}"
  case "$tou" in
    0) log "TOU-Zeitplan inaktiv - Grundzustand wie erwartet." ;;
    ''|NULL|UNDEF) ;;
    *)
      warn "TOU-Zeitplan ist aktiv ($tou) - entweder steuert IBM gerade, oder die"
      warn "Anlage hat einen eigenen Zeitplan, dessen Slot-Werte IBM ueberschreiben wuerde." ;;
  esac
  return $ok
}
