#!/usr/bin/env bash
# ============================================================================
# Wechselrichter-Profil: Sigenergy SigenStor
#
# SigenStor-Anlagen (Hybrid-Wechselrichter mit Batteriestack) sprechen lokal
# Modbus TCP mit einer PROPRIETAEREN Registerkarte (kein SunSpec). Gesteuert
# wird auf Anlagenebene ueber den "Remote EMS"-Modus: ein Freigaberegister
# (40029), ein Modusregister (40031, Werte siehe Appendix 6 des
# Sigenergy-Modbus-Protokolls) und Leistungslimits in Watt:
#   - Ladesperre:            Modus 5 (Entladung, PV zuerst) + Entladelimit 0
#   - forcierte Entladung:   Modus 6 (Entladung, Batterie zuerst) + Limit in W
#   - Ruecksetzen:           Remote EMS aus (40029 = 0), die Anlage kehrt in
#                            ihren konfigurierten EMS-Modus zurueck
#
# Voraussetzungen an der Anlage (mySigen-App, ggf. Installateur-Zugang):
#   - "ModBus TCP Server Enable" aktivieren (Port 502)
#   - "Remote EMS Scheduling Enable" aktivieren
#
# Die Registeradressen unten stammen aus dem offiziellen Sigenergy Modbus
# Protocol (V1.7, 2024-04-09; Anlagenebene = Slave-Adresse 247, Reads per
# FC04 auch fuer die beschreibbaren Register). VOR DER ERSTEN INSTALLATION
# am Geraet verifizieren (Spike, siehe README.md in diesem Verzeichnis).
# Der Adapter weigert sich zu steuern, solange die Plausibilitaetspruefung
# (EMS-Modus lesbar, Nennentladeleistung plausibel) nicht besteht.
# ============================================================================

# Anzeigename im Assistenten
INVERTER_LABEL="Sigenergy SigenStor (Modbus)"

# Addons fuer addons.cfg (Kategorie binding)
INVERTER_BINDINGS="modbus"

# Praefix, unter dem bestehende Things erkannt werden (manueller Weg)
INVERTER_THING_PREFIX="modbus:data"

# Haupt-Thing der automatischen Einrichtung: das SoC-Data-Thing. Das
# Segment ":ibm:" markiert es als von IBM verwaltet (03-install-items.sh),
# und 02b wartet darauf, dass es ONLINE geht.
INVERTER_AUTO_THING_UID="modbus:data:ibm:sg:soc"

# Wechselrichter-Adapter (Adapter-Kontrakt siehe control/core.js)
INVERTER_ADAPTER_SCRIPT="inverters/sigenergy/adapter.js"

# Standardname des Ladestands-Items; zugleich der Platzhalter, den Setup
# und Overview-Seiten durch das konfigurierte Item ersetzen.
INVERTER_SOC_PLACEHOLDER="IBM_SG_SoC"

# Batterieleistungs-Karte: die Anlagenleistung des Batteriestacks (ESS power,
# 30037) ist direkt lesbar. Ueber das gainOffset-Profil wird das Vorzeichen
# auf die IBM-Konvention gedreht (+ entladen, - laden).
INVERTER_BATTERY_POWER_PLACEHOLDER="IBM_SG_BatteryPower"

# Thing mit der Netzwerkadresse (die Modbus-TCP-Bridge) und deren
# Adress-Parameter
INVERTER_HOST_THING_PREFIX="modbus:tcp"
INVERTER_HOST_PARAM="host"

# Netzwerksuche fuer den Watchdog: eigene Modbus-Probe (Sigenergy hat keine
# HTTP-API wie die Fronius Solar API).
INVERTER_REDISCOVER_SCRIPT="inverters/sigenergy/rediscover.sh"

# Keine Zugangsdaten noetig - Modbus TCP kennt keine Anmeldung.
# (INVERTER_USER_PARAM bleibt leer, der Assistent fragt nichts ab.)

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="In der mySigen-App muessen 'ModBus TCP Server Enable' und 'Remote EMS Scheduling Enable' aktiviert sein (Port 502, teils nur mit Installateur-Zugang). Gesteuert wird die Gesamtanlage ueber die Slave-Adresse 247."

# --- Modbus-Registerkarte (Anlagenebene, Slave 247) --------------------------
# Sigenergy adressiert literal (Registeradresse 30014 = Adresse 30014 im
# Request), Reads laufen ueber FC04 (Input-Register) - auch fuer die
# beschreibbaren Halteregister. IM SPIKE VERIFIZIEREN - siehe README.md.
#
#   30003  EMS work mode        U16   (7 = Remote EMS aktiv)
#   30010  Max active power     U32   Gain 1000, kW -> Rohwert = W
#   30014  Anlagen-SoC          U16   Gain 10 -> Rohwert = % * 10
#   30037  ESS power            S32   Gain 1000, kW -> Rohwert = W
#                                     (> 0 laden, < 0 entladen)
#   30068  Rated ESS charging power     U32  Rohwert = W
#   30070  Rated ESS discharging power  U32  Rohwert = W
#   40029  Remote EMS enable    U16   0/1
#   40031  Remote EMS mode      U16   Appendix 6 (5/6 = Entladung)
#   40032  ESS max charging limit     U32  W (wirkt bei Modus 3/4)
#   40034  ESS max discharging limit  U32  W (wirkt bei Modus 5/6)
#   40036  PV max power limit         U32  W (wirkt bei Modus 3-6!)
MODBUS_UNIT_ID="${MODBUS_UNIT_ID:-247}"

# Skalierung des Ladestands: Registerwert 550 = 55,0 % -> Gain 0.1
MODBUS_SOC_GAIN="${MODBUS_SOC_GAIN:-0.1}"

# Vorzeichendreher fuer die Batterieleistung (Sigenergy: + laden;
# IBM-Karte: + entladen)
MODBUS_ESS_POWER_GAIN="${MODBUS_ESS_POWER_GAIN:--1}"

# Thing-Baum der automatischen Einrichtung: tcp-Bridge -> drei Poller
# (Anlagendaten, Nennleistungen, Steuerregister) -> Data-Things je Register.
# Reihenfolge = Anlegereihenfolge.
inverter_things_json() {
  IBM_J_HOST="${INVERTER_HOST:-}" \
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
            "port": 502,
            "id": int(e["IBM_J_UNIT_ID"]),
        },
    },
]

# Poller: id, Start, Laenge, Refresh in ms. Typ immer "input" - Sigenergy
# liest alle Register (auch die beschreibbaren) ueber FC04.
pollers = [
    ("sgplant", 30003, 36, 10000),   # 30003..30038: Modus, SoC, Leistungen
    ("sgrated", 30068, 4,  60000),   # 30068..30071: Nennleistungen
    ("sgctrl",  40029, 9,  10000),   # 40029..40037: Remote-EMS-Register
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
            "type": "input",
            "refresh": refresh,
        },
    })

# id, Poller, Adresse, Wertetyp, beschreibbar?
registers = [
    ("emsmode",  "sgplant", 30003, "uint16", False),  # 7 = Remote EMS
    ("maxactw",  "sgplant", 30010, "uint32", False),  # Anlagenmaximum in W
    ("soc",      "sgplant", 30014, "uint16", False),  # Ladestand (% * 10)
    ("esspower", "sgplant", 30037, "int32",  False),  # Batterieleistung in W
    ("ratedchg", "sgrated", 30068, "uint32", False),  # Nennladeleistung W
    ("rateddis", "sgrated", 30070, "uint32", False),  # Nennentladeleistung W
    ("rmtenable","sgctrl",  40029, "uint16", True),   # Remote EMS an/aus
    ("rmtmode",  "sgctrl",  40031, "uint16", True),   # Remote-EMS-Modus
    ("chglimit", "sgctrl",  40032, "uint32", True),   # Ladelimit W
    ("dislimit", "sgctrl",  40034, "uint32", True),   # Entladelimit W
    ("pvlimit",  "sgctrl",  40036, "uint32", True),   # PV-Limit W
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
        "UID": "modbus:data:ibm:sg:" + reg_id,
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
Number ${SOC_ITEM} "Ladestand Batterie [%.0f %%]" <batterylevel> (IBM) { channel="modbus:data:ibm:sg:soc:number" [profile="modbus:gainOffset", gain="${MODBUS_SOC_GAIN}", pre-gain-offset="0"] }
Number ${BATTERY_POWER_ITEM:-IBM_SG_BatteryPower} "Einspeiseleistung Batterie [%.0f W]" <energy> (IBM) { channel="modbus:data:ibm:sg:esspower:number" [profile="modbus:gainOffset", gain="${MODBUS_ESS_POWER_GAIN}", pre-gain-offset="0"] }

// Modbus-Register (roh) - vom Adapter gelesen bzw. beschrieben
Number IBM_SG_EmsMode         "EMS-Modus [%.0f]"             <settings> (IBM) { channel="modbus:data:ibm:sg:emsmode:number" }
Number IBM_SG_MaxActiveW      "Anlagenmaximum [%.0f W]"      <settings> (IBM) { channel="modbus:data:ibm:sg:maxactw:number" }
Number IBM_SG_RatedChargeW    "Nennladeleistung [%.0f W]"    <settings> (IBM) { channel="modbus:data:ibm:sg:ratedchg:number" }
Number IBM_SG_RatedDischargeW "Nennentladeleistung [%.0f W]" <settings> (IBM) { channel="modbus:data:ibm:sg:rateddis:number" }
Number IBM_SG_RemoteEnable    "Remote EMS aktiv [%.0f]"      <switch>   (IBM) { channel="modbus:data:ibm:sg:rmtenable:number" }
Number IBM_SG_RemoteMode      "Remote-EMS-Modus [%.0f]"      <settings> (IBM) { channel="modbus:data:ibm:sg:rmtmode:number" }
Number IBM_SG_ChargeLimitW    "Ladelimit [%.0f W]"           <settings> (IBM) { channel="modbus:data:ibm:sg:chglimit:number" }
Number IBM_SG_DischargeLimitW "Entladelimit [%.0f W]"        <settings> (IBM) { channel="modbus:data:ibm:sg:dislimit:number" }
Number IBM_SG_PvLimitW        "PV-Limit [%.0f W]"            <settings> (IBM) { channel="modbus:data:ibm:sg:pvlimit:number" }
EOF
}

# Sucht SigenStor-Anlagen im eigenen /24-Netz: Modbus-FC04-Probe auf das
# EMS-Modus-Register (30003) an Slave 247. Eine IP je Zeile.
inverter_scan_hosts() {
  local own_cidr base
  own_cidr="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4; exit}')"
  [ -n "$own_cidr" ] || return 0
  base="${own_cidr%/*}"; base="${base%.*}"
  IBM_SCAN_BASE="$base" IBM_SCAN_UNIT="$MODBUS_UNIT_ID" python3 - <<'PY'
import concurrent.futures, os, socket, struct

base = os.environ["IBM_SCAN_BASE"]
unit = int(os.environ["IBM_SCAN_UNIT"])

def probe(ip):
    try:
        s = socket.create_connection((ip, 502), timeout=1)
        s.settimeout(1.5)
        # MBAP (TID 1, Laenge 6, Unit) + PDU: FC04, Adresse 30003, 1 Register
        s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
                  + struct.pack(">BHH", 4, 30003, 1))
        resp = s.recv(256)
        s.close()
        # Antwort: MBAP (7 Byte) + FC (1) + Bytezahl (1) + Daten (2)
        if len(resp) >= 9 and resp[6] == unit and resp[7] == 4:
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
# die Nennentladeleistung plausibel (sonst zeigen die Adressen ins Leere
# oder es antwortet das falsche Geraet) und der Ladestand im Wertebereich.
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

  local rated
  rated="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/items/IBM_SG_RatedDischargeW/state" 2>/dev/null || true)"
  rated="${rated%% *}"; rated="${rated%.*}"
  case "$rated" in
    NULL|UNDEF|"")
      warn "Nennentladeleistung noch ohne Wert - Poller schon gelaufen?"; ok=1 ;;
    *[!0-9]*)
      warn "Nennentladeleistung unlesbar ('$rated') - Registerkarte/Slave-Adresse pruefen (README)."; ok=1 ;;
    *)
      if [ "$rated" -ge 100 ] && [ "$rated" -le 1000000 ]; then
        log "Nennentladeleistung plausibel: $rated W."
      else
        warn "Nennentladeleistung unplausibel ($rated W) - Registerkarte/Slave-Adresse pruefen (README)."
        ok=1
      fi ;;
  esac
  return $ok
}
