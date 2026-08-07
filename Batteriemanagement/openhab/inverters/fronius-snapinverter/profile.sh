#!/usr/bin/env bash
# ============================================================================
# Wechselrichter-Profil: Fronius Symo Hybrid (SnapINverter-Generation)
#
# Die aeltere Hybrid-Generation (Symo Hybrid + Datamanager 2.0) hat die
# GEN24-Config-API nicht - die Batterie-Actions des Fronius-Bindings
# funktionieren dort nicht. Gesteuert wird stattdessen ueber Modbus TCP und
# das SunSpec Basic Storage Control Model (124): Ladesperre ueber InWRte=0,
# forcierte Entladung ueber negatives InWRte, jeweils relativ zu WChaMax.
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

# Addons fuer addons.cfg (Kategorie binding)
INVERTER_BINDINGS="modbus"

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

# Keine Batterieleistungs-Karte: ob die Entlade-/Ladeleistung auf dieser
# Generation per Modbus sauber lesbar ist (SunSpec Model 160), klaert der
# Spike - bis dahin entfaellt die Karte (der Kontrakt ist optional).

# Thing mit der Netzwerkadresse (fuer Watchdog und Auto-Anlage: die
# Modbus-TCP-Bridge) und deren Adress-Parameter
INVERTER_HOST_THING_PREFIX="modbus:tcp"
INVERTER_HOST_PARAM="host"

# Netzwerksuche: der Datamanager spricht weiterhin die Fronius Solar API -
# Scan und Watchdog-Rediscover des GEN24-Profils passen unveraendert.
INVERTER_REDISCOVER_SCRIPT="inverters/fronius/rediscover.sh"

# Keine Zugangsdaten noetig - Modbus TCP kennt keine Anmeldung.
# (INVERTER_USER_PARAM bleibt leer, der Assistent fragt nichts ab.)

# Hinweis, der im Assistenten und am Ende der Installation angezeigt wird
INVERTER_NOTES="Am Datamanager (Weboberflaeche -> Einstellungen -> Modbus) muss 'Wechselrichter-Steuerung ueber Modbus' aktiviert sein, Modbus TCP Port 502, SunSpec Model Type 'int + SF'. Die Batterie kann im Energiesparmodus bis zu 10 Minuten brauchen, bis sie auf Entladebefehle reagiert."

# --- Modbus-Registerkarte (int + SF) -----------------------------------------
# Fronius dokumentiert Register 1-basiert (Model-124-ID = Register 40314);
# das openHAB-Modbus-Binding erwartet 0-basierte Adressen -> 40313.
# IM SPIKE VERIFIZIEREN - siehe README.md.
MODBUS_UNIT_ID="${MODBUS_UNIT_ID:-1}"
MODBUS_M124_BASE="${MODBUS_M124_BASE:-40313}"

# Skalierung des Ladestands: ChaState hat ueblicherweise ChaState_SF=-2
# (Registerwert 5500 = 55,00 %) -> Gain 0.01. Im Spike verifizieren.
MODBUS_SOC_GAIN="${MODBUS_SOC_GAIN:-0.01}"

# Offsets innerhalb des Model 124 sind durch die SunSpec-Spezifikation fest:
#   +0 ID, +1 L, +2 WChaMax, +5 StorCtl_Mod, +8 ChaState, +12 OutWRte,
#   +13 InWRte, +15 InOutWRte_RvrtTms; Laenge des Blocks: 26 Register.

# Thing-Baum der automatischen Einrichtung: tcp-Bridge -> Poller ueber den
# Model-124-Block -> Data-Things je Register. Reihenfolge = Anlegereihenfolge.
inverter_things_json() {
  IBM_J_HOST="${INVERTER_HOST:-}" \
  IBM_J_UNIT_ID="$MODBUS_UNIT_ID" \
  IBM_J_BASE="$MODBUS_M124_BASE" \
  IBM_J_LABEL="$INVERTER_LABEL" \
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
    ("storctl", 5,  "uint16", True),   # StorCtl_Mod (Bit 0: InWRte aktiv)
    ("soc",     8,  "uint16", False),  # ChaState (Ladestand)
    ("outwrte", 12, "int16",  True),   # Entladelimit in % von WChaMax
    ("inwrte",  13, "int16",  True),   # Ladelimit; negativ = Entladung
    ("rvrttms", 15, "uint16", True),   # Revert-Timeout in Sekunden
]
for reg_id, offset, valuetype, writable in registers:
    cfg = {
        "readStart": str(base + offset),
        "readValueType": valuetype,
    }
    if writable:
        cfg["writeStart"] = str(base + offset)
        cfg["writeValueType"] = valuetype
        cfg["writeType"] = "holding"
    things.append({
        "UID": "modbus:data:ibm:p124:" + reg_id,
        "thingTypeUID": "modbus:data",
        "bridgeUID": "modbus:poller:ibm:p124",
        "label": label + " (" + reg_id + ")",
        "configuration": cfg,
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
Number IBM_MB_OutWRte "OutWRte (roh) [%.0f]"             <settings> (IBM) { channel="modbus:data:ibm:p124:outwrte:number" }
Number IBM_MB_InWRte  "InWRte (roh) [%.0f]"              <settings> (IBM) { channel="modbus:data:ibm:p124:inwrte:number" }
Number IBM_MB_RvrtTms "Revert-Timeout [%.0f s]"          <time>     (IBM) { channel="modbus:data:ibm:p124:rvrttms:number" }
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
# und die Model-ID stimmt (124) - sonst zeigen die Adressen ins Leere.
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
