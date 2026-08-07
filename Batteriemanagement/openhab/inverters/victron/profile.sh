#!/usr/bin/env bash
# ============================================================================
# Wechselrichter-Profil: Victron Energy (GX-Geraet, Modbus)
#
# Victron-Batterieanlagen (MultiPlus/Quattro + MPPT bzw. AC-PV) haben immer
# ein GX-Geraet (Cerbo GX, Venus GX, ...) als Zentrale. Das GX spricht lokal
# Modbus TCP mit einer offiziell dokumentierten Registerkarte
# (github.com/victronenergy/dbus_modbustcp, attributes.csv). Gesteuert wird
# ueber die Settings-Register der ESS-Regelung an Unit-ID 100 - die Anlage
# bleibt dabei in ihrem normalen ESS-Modus:
#   - Ladesperre:          DVCC MaxChargeCurrent (2705) = 0 A
#   - forcierte Entladung: ESS grid setpoint (2700) = -Watt (negativ = ins
#                          Netz einspeisen; der Setpoint wirkt am NETZPUNKT,
#                          die Batterie liefert also Haushalt + Watt)
#   - Ruecksetzen:         beide Register auf die bei der Installation
#                          gemerkten Werkswerte (Items IBM_VIC_Reset*)
#
# BEWUSST NICHT verwendet: ESS Mode 3 (External Control, vebus-Register
# 37/38/39). Dessen 60-Sekunden-Watchdog schaltet den Multi bei
# Kommunikationsverlust dauerhaft in Passthru (Batterie tut nichts mehr,
# bis jemand eingreift) - fuer IBM ist das schlechter als das Restrisiko
# des Settings-Wegs (siehe Fail-Safe-Analyse im README.md).
#
# Voraussetzungen an der Anlage (GX Remote Console):
#   - ESS-Assistent konfiguriert, Modus "Optimiert" (nicht "Batterien
#     geladen halten", nicht "Externe Steuerung")
#   - Settings -> Services -> Modbus TCP aktivieren (Port 502)
#   - Einspeisung aus der Batterie zulaessig (ESS-Einspeise-Einstellungen)
#
# Die Registeradressen unten stammen aus der offiziellen Registerliste
# (dbus_modbustcp, Stand 2026-08). Victron adressiert literal (Adresse 843 =
# Adresse 843 im Request), alles Halteregister: Lesen FC03, Schreiben
# FC06/FC16. VOR DER ERSTEN INSTALLATION am Geraet verifizieren (Spike,
# siehe README.md in diesem Verzeichnis). Der Adapter weigert sich zu
# steuern, solange die Plausibilitaetspruefung (ESS-Modus lesbar und nicht
# "Externe Steuerung", Ladestand plausibel) nicht besteht.
# ============================================================================

# Anzeigename im Assistenten
INVERTER_LABEL="Victron Energy (GX, Modbus)"

# Addons fuer addons.cfg (Kategorie binding)
INVERTER_BINDINGS="modbus"

# Praefix, unter dem bestehende Things erkannt werden (manueller Weg)
INVERTER_THING_PREFIX="modbus:data"

# Haupt-Thing der automatischen Einrichtung: das SoC-Data-Thing. Das
# Segment ":ibm:" markiert es als von IBM verwaltet (03-install-items.sh),
# und 02b wartet darauf, dass es ONLINE geht.
INVERTER_AUTO_THING_UID="modbus:data:ibm:vic:soc"

# Wechselrichter-Adapter (Adapter-Kontrakt siehe control/core.js)
INVERTER_ADAPTER_SCRIPT="inverters/victron/adapter.js"

# Standardname des Ladestands-Items; zugleich der Platzhalter, den Setup
# und Overview-Seiten durch das konfigurierte Item ersetzen.
INVERTER_SOC_PLACEHOLDER="IBM_VIC_SoC"

# Batterieleistungs-Karte: /Dc/Battery/Power (842) ist direkt lesbar.
# Ueber das gainOffset-Profil wird das Vorzeichen auf die IBM-Konvention
# gedreht (Victron: + laden; IBM-Karte: + entladen).
INVERTER_BATTERY_POWER_PLACEHOLDER="IBM_VIC_BatteryPower"

# Thing mit der Netzwerkadresse (die Modbus-TCP-Bridge) und deren
# Adress-Parameter
INVERTER_HOST_THING_PREFIX="modbus:tcp"
INVERTER_HOST_PARAM="host"

# Netzwerksuche fuer den Watchdog: Modbus-Probe auf die GX-Seriennummer
# (Register 800) - anders als bei Sigenergy ist die Geraeteidentitaet
# damit eindeutig pruefbar.
INVERTER_REDISCOVER_SCRIPT="inverters/victron/rediscover.sh"

# Die gemerkten Werkswerte muessen einen openHAB-Neustart ueberleben,
# sonst schriebe ibmReset() nach jedem Neustart die Rueckfallwerte des
# Adapters statt der tatsaechlichen Anlagenwerte (03-install-items.sh
# nimmt diese Items in mapdb.persist auf).
INVERTER_PERSIST_ITEMS="IBM_VIC_ResetSetpointW IBM_VIC_ResetMaxChargeA"

# Keine Zugangsdaten noetig - Modbus TCP kennt keine Anmeldung.
# (INVERTER_USER_PARAM bleibt leer, der Assistent fragt nichts ab.)

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="Auf dem GX-Geraet muss 'Modbus TCP' aktiviert sein (Remote Console: Settings -> Services -> Modbus TCP, Port 502) und der ESS-Assistent im Modus 'Optimiert' laufen. Gesteuert wird ueber die Unit-ID 100 (Systemebene)."

# --- Modbus-Registerkarte (Systemebene, Unit-ID 100) -------------------------
# Quelle: github.com/victronenergy/dbus_modbustcp attributes.csv. Victron
# adressiert literal; alles Halteregister (Lesen FC03, Schreiben FC06/FC16).
# IM SPIKE AM GERAET VERIFIZIEREN - siehe README.md.
#
#   800    Seriennummer GX      String[6] (12 ASCII-Zeichen, nur Watchdog)
#   840    Batteriespannung     U16   Gain 10 (Rohwert = V * 10)
#   841    Batteriestrom        S16   Gain 10 (Rohwert = A * 10)
#   842    Batterieleistung     S16   W (+ laden, - entladen)
#   843    Ladestand            U16   % (Rohwert = %)
#   2700   ESS grid setpoint    S16   W (+ Netzbezug, - Einspeisung)
#   2704   ESS MaxDischargePower S16  Rohwert = W / 10; -1 = unbegrenzt
#   2705   DVCC MaxChargeCurrent S16  A; -1 = unbegrenzt, 0 = Ladesperre
#   2706   ESS MaxFeedInPower   S16   Rohwert = W / 100; -1 = unbegrenzt
#   2707   DC-PV-Ueberschuss einspeisen   U16  0/1
#   2708   AC-PV-Ueberschuss NICHT einspeisen  U16  0/1
#   2900   ESS BatteryLife state U16  9 = "Batterien geladen halten"
#   2901   ESS Minimum SoC      U16   Gain 10 (Rohwert = % * 10)
#   2902   ESS Mode (Hub4Mode)  U16   1/2 = ESS, 3 = Externe Steuerung
MODBUS_UNIT_ID="${MODBUS_UNIT_ID:-100}"

# Vorzeichendreher fuer die Batterieleistung (Victron: + laden;
# IBM-Karte: + entladen)
MODBUS_BATTERY_POWER_GAIN="${MODBUS_BATTERY_POWER_GAIN:--1}"

# Skalierung des ESS-Minimum-SoC: Registerwert 200 = 20,0 % -> Gain 0.1
MODBUS_MINSOC_GAIN="${MODBUS_MINSOC_GAIN:-0.1}"

# Thing-Baum der automatischen Einrichtung: tcp-Bridge -> drei Poller
# (Batteriewerte, ESS-Settings, ESS-Modus) -> Data-Things je Register.
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

# Poller: id, Start, Laenge, Refresh in ms. Victron liest Halteregister
# ueber FC03 -> type "holding".
pollers = [
    ("vicbatt", 840, 4,  10000),   # 840..843: Spannung, Strom, Leistung, SoC
    ("vicset",  2700, 9, 10000),   # 2700..2708: Setpoint, DVCC, Einspeisung
    ("vicess",  2900, 3, 10000),   # 2900..2902: BatteryLife, MinSoc, Modus
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
    ("power",    "vicbatt", 842,  "int16",  False),  # Batterieleistung W
    ("soc",      "vicbatt", 843,  "uint16", False),  # Ladestand %
    ("setpoint", "vicset",  2700, "int16",  True),   # ESS grid setpoint W
    ("maxchg",   "vicset",  2705, "int16",  True),   # DVCC MaxChargeCurrent A
    ("maxfeed",  "vicset",  2706, "int16",  False),  # MaxFeedInPower (roh)
    ("dcfeed",   "vicset",  2707, "uint16", False),  # DC-PV-Einspeisung 0/1
    ("acblock",  "vicset",  2708, "uint16", False),  # AC-PV-Sperre 0/1
    ("blstate",  "vicess",  2900, "uint16", False),  # BatteryLife state
    ("minsoc",   "vicess",  2901, "uint16", False),  # Minimum SoC (% * 10)
    ("essmode",  "vicess",  2902, "uint16", False),  # Hub4Mode 1/2/3
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
        "UID": "modbus:data:ibm:vic:" + reg_id,
        "thingTypeUID": "modbus:data",
        "bridgeUID": "modbus:poller:ibm:" + poller_id,
        "label": label + " (" + reg_id + ")",
        "configuration": cfg,
    })

print(json.dumps(things))
PY
}

# Items der automatischen Einrichtung. SoC (Gain 1) braucht kein Profil;
# Batterieleistung und Minimum-SoC werden per gainOffset skaliert, die
# uebrigen Register bleiben roh - der Adapter rechnet selbst.
#
# IBM_VIC_ResetSetpointW / IBM_VIC_ResetMaxChargeA sind KEINE Register,
# sondern die bei der Installation gemerkten Werkswerte der Anlage -
# inverter_verify() befuellt sie einmalig aus den gelesenen Registern,
# ibmReset() schreibt sie zurueck (Rueckfallwerte stehen im Adapter).
inverter_battery_items() {
  cat <<EOF
Number ${SOC_ITEM} "Ladestand Batterie [%.0f %%]" <batterylevel> (IBM) { channel="modbus:data:ibm:vic:soc:number" }
Number ${BATTERY_POWER_ITEM:-IBM_VIC_BatteryPower} "Einspeiseleistung Batterie [%.0f W]" <energy> (IBM) { channel="modbus:data:ibm:vic:power:number" [profile="modbus:gainOffset", gain="${MODBUS_BATTERY_POWER_GAIN}", pre-gain-offset="0"] }

// Modbus-Register (roh) - vom Adapter gelesen bzw. beschrieben
Number IBM_VIC_GridSetpointW  "ESS-Netz-Sollwert [%.0f W]"    <settings> (IBM) { channel="modbus:data:ibm:vic:setpoint:number" }
Number IBM_VIC_MaxChargeA     "DVCC Max Ladestrom [%.0f A]"   <settings> (IBM) { channel="modbus:data:ibm:vic:maxchg:number" }
Number IBM_VIC_MaxFeedInRaw   "Max Einspeisung roh [%.0f]"    <settings> (IBM) { channel="modbus:data:ibm:vic:maxfeed:number" }
Number IBM_VIC_DcFeedIn       "DC-PV-Einspeisung [%.0f]"      <settings> (IBM) { channel="modbus:data:ibm:vic:dcfeed:number" }
Number IBM_VIC_AcFeedInBlock  "AC-PV-Sperre [%.0f]"           <settings> (IBM) { channel="modbus:data:ibm:vic:acblock:number" }
Number IBM_VIC_BatteryLife    "BatteryLife-Zustand [%.0f]"    <settings> (IBM) { channel="modbus:data:ibm:vic:blstate:number" }
Number IBM_VIC_MinSocPct      "ESS Minimum SoC [%.1f %%]"     <settings> (IBM) { channel="modbus:data:ibm:vic:minsoc:number" [profile="modbus:gainOffset", gain="${MODBUS_MINSOC_GAIN}", pre-gain-offset="0"] }
Number IBM_VIC_EssMode        "ESS-Modus [%.0f]"              <settings> (IBM) { channel="modbus:data:ibm:vic:essmode:number" }

// Gemerkte Werkswerte der Anlage (siehe Kommentar oben) - keine Channels
Number IBM_VIC_ResetSetpointW "Werkswert Netz-Sollwert [%.0f W]" <settings> (IBM)
Number IBM_VIC_ResetMaxChargeA "Werkswert Max Ladestrom [%.0f A]" <settings> (IBM)
EOF
}

# Sucht GX-Geraete im eigenen /24-Netz: Modbus-FC03-Probe auf die
# Seriennummer (Register 800, Unit 100). Eine IP je Zeile.
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
        # MBAP (TID 1, Laenge 6, Unit) + PDU: FC03, Adresse 800, 6 Register
        s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
                  + struct.pack(">BHH", 3, 800, 6))
        resp = s.recv(256)
        s.close()
        # Antwort: MBAP (7 Byte) + FC (1) + Bytezahl (1) + Daten (12)
        if len(resp) >= 21 and resp[6] == unit and resp[7] == 3:
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
# ESS-Modus plausibel (1/2 = ESS aktiv; 3 = Externe Steuerung -> Konflikt),
# Ladestand im Wertebereich. Ausserdem werden hier EINMALIG die Werkswerte
# der Anlage gemerkt (IBM_VIC_Reset*), solange sie noch keinen Wert haben -
# ibmReset() schreibt spaeter genau diese Werte zurueck.
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

  local state
  state="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/items/IBM_VIC_EssMode/state" 2>/dev/null || true)"
  state="${state%% *}"; state="${state%.*}"
  case "$state" in
    1|2) log "ESS-Modus plausibel ($state)." ;;
    3)   warn "ESS steht auf 'Externe Steuerung' (Modus 3) - ein anderes EMS steuert die Anlage, IBM greift dann nicht. In der Remote Console auf 'Optimiert' stellen."; ok=1 ;;
    *)   warn "ESS-Modus unlesbar ('$state') - Registerkarte/Unit-ID pruefen (README)."; ok=1 ;;
  esac

  state="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/items/${SOC_ITEM:-IBM_VIC_SoC}/state" 2>/dev/null || true)"
  state="${state%% *}"; state="${state%.*}"
  case "$state" in
    NULL|UNDEF|"") warn "Ladestand noch ohne Wert - Poller schon gelaufen?"; ok=1 ;;
    *[!0-9]*)      warn "Ladestand unlesbar ('$state')."; ok=1 ;;
    *) if [ "$state" -le 100 ]; then
         log "Ladestand plausibel: $state %."
       else
         warn "Ladestand unplausibel ($state %) - Registerkarte/Unit-ID pruefen (README)."
         ok=1
       fi ;;
  esac

  # Werkswerte einmalig merken (nur solange die Reset-Items leer sind)
  local reg
  for reg in "IBM_VIC_GridSetpointW IBM_VIC_ResetSetpointW Netz-Sollwert" \
             "IBM_VIC_MaxChargeA IBM_VIC_ResetMaxChargeA Max-Ladestrom"; do
    set -- $reg
    local src="$1" dst="$2" name="$3" cur val
    cur="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
        "http://127.0.0.1:8080/rest/items/$dst/state" 2>/dev/null || true)"
    case "$cur" in
      NULL|UNDEF|"")
        val="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
            "http://127.0.0.1:8080/rest/items/$src/state" 2>/dev/null || true)"
        val="${val%% *}"
        case "$val" in
          ''|NULL|UNDEF) warn "Werkswert $name nicht lesbar - Rueckfallwert des Adapters gilt."; ok=1 ;;
          *) curl -s -m 10 -o /dev/null -X PUT -H "Authorization: Bearer $OH_API_TOKEN" \
               -H 'Content-Type: text/plain' -d "$val" \
               "http://127.0.0.1:8080/rest/items/$dst/state"
             log "Werkswert gemerkt: $name = $val ($dst)" ;;
        esac ;;
      *) log "Werkswert bereits gemerkt: $name = $cur ($dst)" ;;
    esac
  done
  return $ok
}
