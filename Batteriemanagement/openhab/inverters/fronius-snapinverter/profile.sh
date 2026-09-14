#!/usr/bin/env bash
# ============================================================================
# Wechselrichter-Profil: Fronius Symo Hybrid (SnapINverter-Generation)
#
# Die aeltere Hybrid-Generation (Symo Hybrid + Datamanager 2.0) hat die
# GEN24-Config-API nicht - die Batterie-Actions des Fronius-Bindings
# funktionieren dort nicht. Gesteuert wird stattdessen ueber Modbus TCP und
# das SunSpec Basic Storage Control Model (124): Ladesperre ueber InWRte=0
# (StorCtl_Mod=1), forcierte Entladung ueber das Fenster InWRte=-x/OutWRte=x
# (StorCtl_Mod=3), jeweils in Prozent von WChaMax (Fronius-Anleitung
# 42,0410,2049, Beispiele 2 und 6).
#
# Die Leistungswerte (Batterie, Netz, PV) liefert Modbus auf dieser
# Generation nicht. Sie kommen ueber die Fronius Solar API des Datamanagers
# (GetPowerFlowRealtimeData) und das Fronius-Binding - dieselben Channels
# wie im GEN24-Profil, nur ohne Zugangsdaten (die Batterie-Actions des
# Bindings werden hier nicht gebraucht).
#
# Voraussetzungen am Datamanager (Weboberflaeche -> Einstellungen -> Modbus):
#   - "Wechselrichter-Steuerung ueber Modbus" aktivieren
#   - Modbus TCP aktiv, Port 502
#   - SunSpec Model Type: "int + SF" (float verschiebt alle Adressen!)
#
# Die Registeradressen unten folgen der Fronius-Registerkarte (int + SF)
# und der festen Punktreihenfolge des SunSpec-Model 124. VOR DER ERSTEN
# INSTALLATION am Geraet verifizieren (Spike, siehe README.md in diesem
# Verzeichnis): das Register an MODBUS_M124_BASE muss den Wert 124 liefern.
# Der Adapter weigert sich zu steuern, solange das nicht stimmt.
# ============================================================================

# Anzeigename im Assistenten
INVERTER_LABEL="Fronius Symo Hybrid (SnapINverter, Modbus)"

# Addons fuer addons.cfg (Kategorie binding): modbus fuer die Steuerung,
# fronius fuer die Leistungswerte aus der Solar API
INVERTER_BINDINGS="modbus fronius"

# Praefix, unter dem bestehende Things erkannt werden (manueller Weg)
INVERTER_THING_PREFIX="modbus:data"

# Haupt-Thing der automatischen Einrichtung: das SoC-Data-Thing. Das
# Segment ":ibm:" markiert es als von IBM verwaltet (03-install-items.sh),
# und 02b wartet darauf, dass es ONLINE geht.
INVERTER_AUTO_THING_UID="modbus:data:ibm:p124:soc"

# Wechselrichter-Adapter (Adapter-Kontrakt siehe control/core.js)
INVERTER_ADAPTER_SCRIPT="inverters/fronius-snapinverter/adapter.js"

# Standardname des Ladestands-Items; zugleich der Platzhalter, den Setup
# und Overview-Seiten durch das konfigurierte Item ersetzen.
INVERTER_SOC_PLACEHOLDER="IBM_MB_SoC"

# Leistungs-Items: laut Registerkarte fuehrt Model 160 auf dem Symo Hybrid
# nur "String 1"/"String 2", Batterie- und Netzleistung sind per Modbus
# nicht lesbar. Deshalb haengen sie am powerinverter-Thing des Fronius-
# Bindings (Solar API: P_Akku, P_Grid, P_PV). Vorzeichen wie im GEN24-Profil
# und wie der Kern sie erwartet: Batterie + entladen / - laden, Netz
# + Bezug / - Einspeisung. Die Standardnamen sind die des GEN24-Profils -
# Status-Push, Overview-Seite und Netzeinspeisungs-Regel greifen damit
# unveraendert.
INVERTER_BATTERY_POWER_PLACEHOLDER="Fronius_Symo_Inverter_Battery_Power"
INVERTER_GRID_POWER_PLACEHOLDER="Fronius_Symo_Inverter_Grid_Power"
INVERTER_PV_POWER_PLACEHOLDER="Fronius_Symo_Inverter_Solar_Plant_Power"
INVERTER_BATTERY_POWER_CHANNEL="powerflowchannelpakku"
INVERTER_GRID_POWER_CHANNEL="powerflowchannelpgrid"
INVERTER_PV_POWER_CHANNEL="powerflowchannelppv"

# UID des Solar-API-Things, an dem die Leistungs-Channels haengen
FRONIUS_POWER_THING_UID="fronius:powerinverter:ibm:inverter1"

# Thing mit der Netzwerkadresse (fuer Watchdog und Auto-Anlage: die
# Modbus-TCP-Bridge) und deren Adress-Parameter
INVERTER_HOST_THING_PREFIX="modbus:tcp"
INVERTER_HOST_PARAM="host"

# Weitere Things mit derselben Netzwerkadresse ("uid=parameter", Leerzeichen-
# getrennt): die Solar-API-Bridge des Fronius-Bindings. Der Watchdog traegt
# eine neu gefundene Adresse auch dort ein und gleicht sie im Normalbetrieb
# mit der Modbus-Bridge ab.
INVERTER_EXTRA_HOST_THINGS="fronius:bridge:ibm=hostname"

# Netzwerksuche: der Datamanager spricht weiterhin die Fronius Solar API -
# Scan und Watchdog-Rediscover des GEN24-Profils passen unveraendert.
INVERTER_REDISCOVER_SCRIPT="inverters/fronius/rediscover.sh"

# Keine Zugangsdaten noetig - Modbus TCP kennt keine Anmeldung, und die
# Solar API ist lesend ohne Anmeldung erreichbar.
# (INVERTER_USER_PARAM bleibt leer, der Assistent fragt nichts ab.)

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="Am Datamanager (Weboberflaeche -> Einstellungen -> Modbus) muss 'Wechselrichter-Steuerung ueber Modbus' aktiviert sein, Modbus TCP Port 502, SunSpec Model Type 'int + SF'. Die Leistungswerte kommen ueber die Solar API des Datamanagers (ohne Anmeldung). Die Batterie kann im Energiesparmodus bis zu 10 Minuten brauchen, bis sie auf Entladebefehle reagiert."

# --- Modbus-Registerkarte (int + SF) -----------------------------------------
# Startadresse des Basic Storage Control Model laut Fronius-Anleitung
# "Datamanager Modbus TCP & RTU" (42,0410,2049, S. 47): 40303 bei int+SF,
# 40313 bei float. Die Registerkarte (docs/registerkarten, Blatt IC124)
# fuehrt die ID als Register 40304 (1-basiert); das openHAB-Modbus-Binding
# adressiert 0-basiert -> 40303. IM SPIKE VERIFIZIEREN - siehe README.md.
# Unit-ID = Wechselrichter-Nummer am Display des Hybrid (00 -> 100);
# bei Master/Slave im Solar Net antwortet jeder Wechselrichter unter
# seiner eigenen Nummer, Model 124 liefert nur der Hybrid.
MODBUS_UNIT_ID="${MODBUS_UNIT_ID:-1}"
MODBUS_M124_BASE="${MODBUS_M124_BASE:-40303}"

# Skalierung des Ladestands: ChaState hat ueblicherweise ChaState_SF=-2
# (Registerwert 5500 = 55,00 %) -> Gain 0.01. Im Spike verifizieren.
MODBUS_SOC_GAIN="${MODBUS_SOC_GAIN:-0.01}"

# Offsets innerhalb des Model 124 sind durch die SunSpec-Spezifikation fest:
#   +0 ID, +1 L, +2 WChaMax, +5 StorCtl_Mod, +8 ChaState, +11 ChaSt,
#   +12 OutWRte, +13 InWRte, +15 InOutWRte_RvrtTms; Laenge: 26 Register.
# Laut Registerkarte sind InOutWRte_WinTms/RvrtTms/RmpTms beim Datamanager
# "Not supported" (nur lesbar) - RvrtTms wird deshalb nur gepollt, nicht
# beschrieben; der Fail-Safe ist der zyklische Reset des Kerns (README).

# Thing-Baum der automatischen Einrichtung: tcp-Bridge -> Poller ueber den
# Model-124-Block -> Data-Things je Register, danach die Solar-API-Bridge
# des Fronius-Bindings mit dem powerinverter-Thing fuer die Leistungswerte.
# Reihenfolge = Anlegereihenfolge.
inverter_things_json() {
  IBM_J_HOST="${INVERTER_HOST:-}" \
  IBM_J_UNIT_ID="$MODBUS_UNIT_ID" \
  IBM_J_BASE="$MODBUS_M124_BASE" \
  IBM_J_LABEL="$INVERTER_LABEL" \
  IBM_J_POWER_UID="$FRONIUS_POWER_THING_UID" \
  python3 - <<'PY'
import json, os
e = os.environ
base = int(e["IBM_J_BASE"])
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
    {
        "UID": "modbus:poller:ibm:p124",
        "thingTypeUID": "modbus:poller",
        "bridgeUID": "modbus:tcp:ibm",
        "label": label + " (Storage Model 124)",
        "configuration": {
            "start": base,
            "length": 26,
            "type": "holding",
            "refresh": 10000,
        },
    },
]

# id, Offset im Model 124, Wertetyp, beschreibbar?
registers = [
    ("modelid", 0,  "uint16", False),  # SunSpec-Model-ID, muss 124 sein
    ("wchamax", 2,  "uint16", False),  # Referenz fuer die Prozentwerte
    ("storctl", 5,  "uint16", True),   # StorCtl_Mod (Bit 0: InWRte, Bit 1: OutWRte aktiv)
    ("soc",     8,  "uint16", False),  # ChaState (Ladestand)
    ("chast",   11, "uint16", False),  # ChaSt (Batteriestatus, Enum)
    ("outwrte", 12, "int16",  True),   # Entladelimit in % von WChaMax
    ("inwrte",  13, "int16",  True),   # Ladelimit; negativ = Entladung
    ("rvrttms", 15, "uint16", False),  # Revert-Timeout - laut Registerkarte nicht unterstuetzt
]
for reg_id, offset, valuetype, writable in registers:
    cfg = {
        "readStart": str(base + offset),
        "readValueType": valuetype,
    }
    if writable:
        cfg["writeStart"] = str(base + offset)
        # Das Modbus-Binding kennt fuer Schreibzugriffe kein "uint16" - int16
        # deckt beide ab (openHAB 5.2: "int16 (int16, uint16)"). Mit "uint16"
        # bleibt das Thing UNINITIALIZED und jeder Write laeuft ins Leere
        # (pi-020, 2026-09-11).
        cfg["writeValueType"] = "int16" if valuetype == "uint16" else valuetype
        cfg["writeType"] = "holding"
    things.append({
        "UID": "modbus:data:ibm:p124:" + reg_id,
        "thingTypeUID": "modbus:data",
        "bridgeUID": "modbus:poller:ibm:p124",
        "label": label + " (" + reg_id + ")",
        "configuration": cfg,
    })

# Solar API (nur lesend): Bridge mit der Adresse, daran der Wechselrichter
# unter derselben Geraetenummer wie die Modbus-Unit-ID. Ohne Zugangsdaten -
# die Batterie-Actions des Bindings gibt es auf dieser Generation ohnehin
# nicht, die Leistungs-Channels brauchen keine.
things.append({
    "UID": "fronius:bridge:ibm",
    "thingTypeUID": "fronius:bridge",
    "label": label + " (Solar API)",
    "configuration": {"hostname": e["IBM_J_HOST"]},
})
things.append({
    "UID": e["IBM_J_POWER_UID"],
    "thingTypeUID": "fronius:powerinverter",
    "bridgeUID": "fronius:bridge:ibm",
    "label": label + " (Leistungswerte)",
    "configuration": {"deviceId": int(e["IBM_J_UNIT_ID"])},
})

print(json.dumps(things))
PY
}

# Items der automatischen Einrichtung. Das SoC-Item wird ueber das
# gainOffset-Profil des Modbus-Bindings skaliert; die Registeritems bleiben
# roh - der Adapter rechnet selbst (und schreibt Rohwerte zurueck).
inverter_battery_items() {
  cat <<EOF
Number ${SOC_ITEM} "Ladestand Batterie [%.0f %%]" <batterylevel> (IBM) { channel="modbus:data:ibm:p124:soc:number" [profile="modbus:gainOffset", gain="${MODBUS_SOC_GAIN}", pre-gain-offset="0"] }

// Modbus-Register (roh) - vom Adapter gelesen bzw. beschrieben
Number IBM_MB_ModelId "SunSpec Model-ID [%.0f]"          <settings> (IBM) { channel="modbus:data:ibm:p124:modelid:number" }
Number IBM_MB_WChaMax "WChaMax (roh) [%.0f]"             <settings> (IBM) { channel="modbus:data:ibm:p124:wchamax:number" }
Number IBM_MB_StorCtl "StorCtl_Mod [%.0f]"               <settings> (IBM) { channel="modbus:data:ibm:p124:storctl:number" }
Number IBM_MB_ChaSt   "Batteriestatus (ChaSt) [%.0f]"    <settings> (IBM) { channel="modbus:data:ibm:p124:chast:number" }
Number IBM_MB_OutWRte "OutWRte (roh) [%.0f]"             <settings> (IBM) { channel="modbus:data:ibm:p124:outwrte:number" }
Number IBM_MB_InWRte  "InWRte (roh) [%.0f]"              <settings> (IBM) { channel="modbus:data:ibm:p124:inwrte:number" }
Number IBM_MB_RvrtTms "Revert-Timeout (nur lesend) [%.0f s]" <time> (IBM) { channel="modbus:data:ibm:p124:rvrttms:number" }
EOF
  # Leistungswerte aus der Solar API (Fronius-Binding); ohne Itemnamen in
  # ibm.conf entfallen sie.
  local power="${FRONIUS_POWER_THING_UID}"
  [ -z "${BATTERY_POWER_ITEM:-}" ] || cat <<EOF

// Leistungswerte aus der Solar API (Fronius-Binding)
Number:Power ${BATTERY_POWER_ITEM} "Batterieleistung [%.0f W]" <energy> (IBM) { channel="${power}:${INVERTER_BATTERY_POWER_CHANNEL}", unit="W" }
EOF
  [ -z "${GRID_POWER_ITEM:-}" ] || cat <<EOF
Number:Power ${GRID_POWER_ITEM} "Netzleistung [%.0f W]" <energy> (IBM) { channel="${power}:${INVERTER_GRID_POWER_CHANNEL}", unit="W" }
EOF
  [ -z "${PV_POWER_ITEM:-}" ] || cat <<EOF
Number:Power ${PV_POWER_ITEM} "PV-Leistung [%.0f W]" <solarplant> (IBM) { channel="${power}:${INVERTER_PV_POWER_CHANNEL}", unit="W" }
EOF
}

# Sucht Fronius-Geraete im eigenen /24-Netz (Solar-API-Endpunkt), eine IP je
# Zeile - identisch zum GEN24-Profil, der Datamanager antwortet dort ebenso.
inverter_scan_hosts() {
  local own_cidr base
  own_cidr="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4; exit}')"
  [ -n "$own_cidr" ] || return 0
  base="${own_cidr%/*}"; base="${base%.*}"
  seq 1 254 | xargs -P 32 -I'{}' sh -c '
    if curl -sf -m 2 --connect-timeout 1 "http://$1/solar_api/GetAPIVersion.cgi" 2>/dev/null | grep -q "\"APIVersion\""; then
      echo "$1"
    fi' _ "${base}.{}"
}

# Zusaetzliche Pruefungen fuer 06-verify.sh: alle Things des Baums ONLINE
# (Modbus und Solar API) und die Model-ID stimmt (124) - sonst zeigen die
# Adressen ins Leere.
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

  local model_id
  model_id="$(curl -s -m 10 -H "Authorization: Bearer $OH_API_TOKEN" \
      "http://127.0.0.1:8080/rest/items/IBM_MB_ModelId/state" 2>/dev/null || true)"
  case "$model_id" in
    124|124.0|"124 "*)
      log "SunSpec Model 124 an der Basisadresse bestaetigt." ;;
    NULL|UNDEF|"")
      warn "Model-ID noch ohne Wert - Poller schon gelaufen?"; ok=1 ;;
    *)
      warn "Register an MODBUS_M124_BASE liefert '$model_id' statt 124 - Adresse/Registerkarte pruefen (README)."; ok=1 ;;
  esac
  return $ok
}
