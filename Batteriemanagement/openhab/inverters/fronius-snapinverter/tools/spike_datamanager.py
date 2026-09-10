#!/usr/bin/env python3
"""Spike-Werkzeug fuer die Fronius-Datamanager-Registerverifikation (README).

Arbeitet die Spike-Checkliste des Profils fronius-snapinverter direkt gegen
den Datamanager 2.0 ab - VOR der ersten IBM-Installation, ohne openHAB.
Nur Standardbibliothek (laeuft auf dem Pi wie am Laptop), Modbus TCP,
Reads per FC03, Writes per FC06, 0-basiert adressiert - exakt wie das
openHAB-Modbus-Binding und damit wie das Profil. Die Erwartungen stammen
aus der Fronius-Anleitung "Datamanager Modbus TCP & RTU" (42,0410,2049,
S. 45-48) und der Registerkarte 1.1.5-1 (docs/registerkarten).

Schritte (einzeln oder kombiniert aufrufbar):

    chain      Punkt 1+8: SunSpec-Kette ab 40000 abgehen ("SunS"), alle
               Modelle mit Adresse listen, Basis von Model 124 ermitteln
               (Erwartung int+SF: 40303; 40313 = Datamanager steht auf
               float!), Common Block (Hersteller/Typ/Firmware/Seriennummer)
               und Model 160 (MPPT-Module mit Namen) anzeigen. Read-only.
    units      Punkt 9: Unit-IDs 1-10 und 100 durchprobieren - welche
               antwortet, welche hat Model 124 mit WChaMax > 0 (Hybrid),
               welche ist der Nicht-Hybrid-Slave. Read-only.
    reads      Punkt 2/3/4: Model-124-Block lesen, alle Punkte mit
               Skalierungsfaktoren dekodieren, SoC gegen die Solar API
               vergleichen. Read-only.
    watch      SoC / ChaSt / Limits alle 10 s lesen (plus P_Akku aus der
               Solar API), bis Ctrl+C.
    prevent    Punkt 5: Ladesperre wie Fronius-Beispiel 2 (InWRte=0,
               StorCtl_Mod=1). Steht bis Enter, dann Reset.
    discharge  Punkt 6: forcierte Entladung wie Fronius-Beispiel 6
               (InWRte=-x %, OutWRte=+x %, StorCtl_Mod=3), x aus --watts.
               Steht bis Enter, dann Reset.
    discharge-inonly
               Punkt 6, Gegenprobe: nur InWRte=-x % mit StorCtl_Mod=1
               (fruehere Adapter-Annahme) - zeigt, ob das allein wirkt.
    revert     Punkt 7: InOutWRte_RvrtTms schreiben (Erwartung laut
               Registerkarte: Exception, "Not supported"). Wird der Write
               angenommen, folgt eine Ladesperre und die Beobachtung, ob
               sie nach Ablauf von selbst faellt.
    failsafe   Entladung kommandieren und OHNE Reset beenden - danach
               beobachten, ob der Wechselrichter von selbst zurueckfaellt
               (Erwartung: nein, die Werte bleiben stehen). Aufraeumen:
               Schritt reset.
    reset      InWRte=100 %, OutWRte=100 %, StorCtl_Mod=0 - Werksverhalten.

Beispiele:

    python3 spike_datamanager.py 192.168.1.50 chain units reads
    python3 spike_datamanager.py 192.168.1.50 prevent discharge --watts 1500
    python3 spike_datamanager.py 127.0.0.1 --port 5020 --no-api --yes chain reads prevent
    python3 spike_datamanager.py 192.168.1.50 reset

Jeder steuernde Schritt fragt vorher nach Bestaetigung (--yes unterdrueckt
das, fuer den Simulator). Bei Ctrl+C oder Fehlern wird zurueckgesetzt -
ausser im Schritt failsafe, der das Stehenlassen will. Alle Ausgaben
landen zusaetzlich in --log (Vorgabe: spike_datamanager.log).

Voraussetzungen am Datamanager (Weboberflaeche -> Einstellungen -> Modbus):
Datenausgabe ueber Modbus = tcp, Port 502, SunSpec Model Type "int + SF",
"Wechselrichter-Steuerung ueber Modbus" aktiv (ggf. "Steuerung
einschraenken" auf die IP dieses Rechners/des Pi). Bei mehreren Geraeten
im Solar Net Ring empfiehlt Fronius 10 s Timeout und nur sequenzielle
Abfragen (S. 15) - beides haelt dieses Skript ein.
"""

import argparse
import datetime
import json
import socket
import struct
import sys
import time
import urllib.request

SUNS_BASE = 40000           # "SunS" (0x5375 0x6E53), danach die Modellkette
M124_BASE_INTSF = 40303     # Anleitung S. 47: Startadresse bei int+SF
M124_BASE_FLOAT = 40313     # ... bei float (dann steht der Datamanager falsch)
M124_LEN = 26               # ID + L + 24 Register

# Offsets im Model 124 (0-basiert ab der ID), Registerkarte Blatt IC124
OFF = {
    "ID": 0, "L": 1, "WChaMax": 2, "WChaGra": 3, "WDisChaGra": 4,
    "StorCtl_Mod": 5, "VAChaMax": 6, "MinRsvPct": 7, "ChaState": 8,
    "StorAval": 9, "InBatV": 10, "ChaSt": 11, "OutWRte": 12, "InWRte": 13,
    "InOutWRte_WinTms": 14, "InOutWRte_RvrtTms": 15, "InOutWRte_RmpTms": 16,
    "ChaGriSet": 17, "WChaMax_SF": 18, "WChaDisChaGra_SF": 19,
    "VAChaMax_SF": 20, "MinRsvPct_SF": 21, "ChaState_SF": 22,
    "StorAval_SF": 23, "InBatV_SF": 24, "InOutWRte_SF": 25,
}
NOT_SUPPORTED = {"VAChaMax", "StorAval", "InBatV", "InOutWRte_WinTms",
                 "InOutWRte_RvrtTms", "InOutWRte_RmpTms", "VAChaMax_SF",
                 "StorAval_SF", "InBatV_SF"}
CHAST = {1: "OFF", 2: "EMPTY", 3: "DISCHARGING", 4: "CHARGING", 5: "FULL",
         6: "HOLDING", 7: "TESTING"}
STORCTL_CHARGE_BIT = 1      # InWRte aktiv
STORCTL_DISCHARGE_BIT = 2   # OutWRte aktiv

# Anleitung S. 15: bei mehreren Geraeten im Ring >= 10 s Timeout, sequenziell
MODBUS_TIMEOUT_S = 10.0
REQUEST_PAUSE_S = 0.5

LOG_FILE = None


def log(msg=""):
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}" if msg else ""
    print(line, flush=True)
    if LOG_FILE:
        LOG_FILE.write(line + "\n")
        LOG_FILE.flush()


class ModbusError(Exception):
    CODES = {1: "Illegal function", 2: "Illegal data address",
             3: "Illegal data value", 4: "Slave device failure",
             10: "Gateway path unavailable", 11: "Gateway target failed"}

    def __init__(self, fc, code):
        self.fc, self.code = fc, code
        name = self.CODES.get(code, f"Code {code}")
        super().__init__(f"Modbus-Exception auf FC{fc}: {name} (0x{code:02X})")


class Datamanager:
    """Minimaler Modbus-TCP-Client (FC03 lesen, FC06 schreiben)."""

    def __init__(self, host, port, unit, timeout=MODBUS_TIMEOUT_S):
        self.host, self.port, self.unit = host, port, unit
        self.timeout = timeout
        self.sock = None
        self.tid = 0
        self.last_request = 0.0

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port),
                                             timeout=self.timeout)
        self.sock.settimeout(self.timeout)

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    def _recvall(self, n):
        data = b""
        while len(data) < n:
            chunk = self.sock.recv(n - len(data))
            if not chunk:
                raise ConnectionError("Verbindung geschlossen")
            data += chunk
        return data

    def _request(self, pdu, unit=None):
        unit = self.unit if unit is None else unit
        wait = REQUEST_PAUSE_S - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        if self.sock is None:
            self.connect()
        self.tid = (self.tid + 1) % 0xFFFF
        frame = struct.pack(">HHHB", self.tid, 0, len(pdu) + 1, unit) + pdu
        self.sock.sendall(frame)
        header = self._recvall(7)
        _tid, _proto, length, _unit = struct.unpack(">HHHB", header)
        resp = self._recvall(length - 1)
        self.last_request = time.monotonic()
        if resp[0] & 0x80:
            raise ModbusError(resp[0] & 0x7F, resp[1])
        return resp

    def read(self, address, count, unit=None):
        """FC03 (Holding-Register) - der Datamanager liest so alle Modelle."""
        resp = self._request(struct.pack(">BHH", 3, address, count), unit)
        return list(struct.unpack(f">{count}H", resp[2:2 + count * 2]))

    def write(self, address, value, name=""):
        """FC06, int16/uint16 (negative Werte im Zweierkomplement)."""
        self._request(struct.pack(">BHH", 6, address, value & 0xFFFF))
        log(f"  WRITE {address} {name} = {value} (FC06)")


def s16(v):
    return v - 0x10000 if v >= 0x8000 else v


def scaled(raw, sf):
    return raw * (10 ** s16(sf))


def words_to_str(words):
    raw = b"".join(struct.pack(">H", w) for w in words)
    return raw.split(b"\0", 1)[0].decode("ascii", "replace").strip()


def confirm(args, text):
    if args.yes:
        log(f"  ({text} - bestaetigt via --yes)")
        return True
    answer = input(f"  {text} [ja/nein] ").strip().lower()
    return answer in ("j", "ja", "y", "yes")


def wait_enter(args, text):
    if args.yes:
        log(f"  ({text} - uebersprungen via --yes)")
        return
    input(f"  {text} - Enter druecken, wenn beobachtet ... ")


# --- Solar API (Gegenprobe fuer SoC und Batterieleistung) -------------------

def solar_api(args, path):
    if args.no_api:
        return None
    url = f"http://{args.api_host or args.host}/solar_api/v1/{path}"
    try:
        with urllib.request.urlopen(url, timeout=4) as resp:
            return json.load(resp)
    except Exception as e:  # Netz, JSON, 404 - alles nur Hinweis
        log(f"  (Solar API {path} nicht erreichbar: {e})")
        return None


def api_soc(args):
    data = solar_api(args, "GetStorageRealtimeData.cgi?Scope=System")
    try:
        first = next(iter(data["Body"]["Data"].values()))
        return float(first["Controller"]["StateOfCharge_Relative"])
    except Exception:
        return None


def api_powerflow(args):
    """Liefert (P_Akku, SOC) aus GetPowerFlowRealtimeData - P_Akku > 0 =
    Entladung, < 0 = Ladung (Solar-API-Konvention)."""
    data = solar_api(args, "GetPowerFlowRealtimeData.fcgi")
    try:
        site = data["Body"]["Data"]["Site"]
        p_akku = site.get("P_Akku")
        soc = None
        for inv in data["Body"]["Data"].get("Inverters", {}).values():
            if inv.get("SOC") is not None:
                soc = float(inv["SOC"])
        return (None if p_akku is None else float(p_akku)), soc
    except Exception:
        return None, None


# --- Model-124-Zugriff ------------------------------------------------------

class Model124:
    def __init__(self, dev, base):
        self.dev, self.base = dev, base

    def block(self):
        return self.dev.read(self.base, M124_LEN)

    def raw(self, name, blk=None):
        blk = blk or self.block()
        return blk[OFF[name]]

    def write(self, name, value):
        self.dev.write(self.base + OFF[name], value, name)

    def decode(self, blk):
        sf_w = blk[OFF["InOutWRte_SF"]]
        return {
            "id": blk[OFF["ID"]],
            "len": blk[OFF["L"]],
            "wchamax_w": scaled(blk[OFF["WChaMax"]], blk[OFF["WChaMax_SF"]]),
            "storctl": blk[OFF["StorCtl_Mod"]],
            "minrsv_pct": scaled(blk[OFF["MinRsvPct"]], blk[OFF["MinRsvPct_SF"]]),
            "soc_pct": scaled(blk[OFF["ChaState"]], blk[OFF["ChaState_SF"]]),
            "chast": blk[OFF["ChaSt"]],
            "outwrte_pct": scaled(s16(blk[OFF["OutWRte"]]), sf_w),
            "inwrte_pct": scaled(s16(blk[OFF["InWRte"]]), sf_w),
            "rvrttms": blk[OFF["InOutWRte_RvrtTms"]],
            "chagriset": blk[OFF["ChaGriSet"]],
        }

    def status_line(self, args):
        d = self.decode(self.block())
        line = (f"SoC {d['soc_pct']:.1f} %  ChaSt {CHAST.get(d['chast'], d['chast'])}"
                f"  StorCtl {d['storctl']}  InWRte {d['inwrte_pct']:+.0f} %"
                f"  OutWRte {d['outwrte_pct']:+.0f} %")
        p_akku, _ = api_powerflow(args)
        if p_akku is not None:
            line += f"  P_Akku {p_akku:+.0f} W (API: >0 entladen)"
        return line


def find_base(dev, quiet=False):
    """Geht die SunSpec-Kette ab und liefert (base_124, models) oder (None, models)."""
    suns = dev.read(SUNS_BASE, 2)
    if suns != [0x5375, 0x6E53]:
        raise RuntimeError(f"Keine 'SunS'-Kennung an {SUNS_BASE} (gelesen "
                           f"{suns[0]:#06x},{suns[1]:#06x}) - falsche "
                           f"Unit-ID oder Modbus TCP nicht aktiv?")
    addr = SUNS_BASE + 2
    models = []
    base = None
    for _ in range(40):
        mid, length = dev.read(addr, 2)
        if mid == 0xFFFF:
            break
        models.append((mid, length, addr))
        if mid == 124:
            base = addr
        addr += 2 + length
    return base, models


def resolve_base(dev, args):
    if args.base:
        return args.base
    base, _ = find_base(dev)
    if base is None:
        raise RuntimeError("Kein Model 124 in der Kette - kein Hybrid unter "
                           "dieser Unit-ID (Schritt units) oder kein Speicher.")
    return base


# --- Schritte ---------------------------------------------------------------

def step_chain(dev, args):
    log("== CHAIN: Punkt 1/8 - SunSpec-Kette, Basis von Model 124, Model 160 ==")
    base, models = find_base(dev)
    for mid, length, addr in models:
        note = ""
        if mid == 1:
            common = dev.read(addr + 2, 66)
            note = (f"  Hersteller '{words_to_str(common[0:16])}', "
                    f"Typ '{words_to_str(common[16:32])}', "
                    f"SW '{words_to_str(common[40:48])}', "
                    f"SN '{words_to_str(common[48:64])}', "
                    f"Geraeteadresse {common[64]}")
        if mid in (111, 112, 113):
            note = "  !! FLOAT-Inverter-Model - Datamanager steht auf float, nicht int+SF!"
        if mid == 160:
            # Registerkarte I160: DCW_SF an +5, N an +9, Module ab +11
            # (1-basiert), je 20 Register: ID, IDStr(8), DCA, DCV, DCW, ...
            m160 = dev.read(addr, 2 + length)
            n = m160[8] if length >= 8 else "?"
            note = (f"  {n} MPPT-Module (Punkt 8: laut Registerkarte nur "
                    f"'String 1'/'String 2', keine Batterie)")
            if isinstance(n, int) and n:
                dcw_sf = s16(m160[4])
                for i in range(min(n, 4)):
                    mod = m160[10 + i * 20: 30 + i * 20]
                    if len(mod) < 20:
                        break
                    name = words_to_str(mod[1:9])
                    log(f"      Modul {i + 1} '{name}': DCW raw {mod[11]} "
                        f"-> {scaled(mod[11], dcw_sf):.0f} W")
        log(f"  Model {mid:>3} L={length:<3} ab Adresse {addr}{note}")
    if base is None:
        log("  !! Kein Model 124 - kein Hybrid unter dieser Unit-ID oder kein Speicher.")
        return
    verdict = {M124_BASE_INTSF: "OK - wie profile.sh (int+SF)",
               M124_BASE_FLOAT: "!! FLOAT-Adresse - Datamanager auf int+SF umstellen"}
    log(f"  Model 124 ab Adresse {base} (0-basiert): "
        f"{verdict.get(base, '!! unerwartet - MODBUS_M124_BASE anpassen')}")
    log("")


def step_units(dev, args):
    log("== UNITS: Punkt 9 - Unit-IDs durchprobieren ==")
    hybrid = None
    for unit in list(range(1, 11)) + [100]:
        try:
            suns = dev.read(SUNS_BASE, 2, unit=unit)
        except ModbusError as e:
            log(f"  Unit {unit:>3}: Exception ({e.CODES.get(e.code, e.code)})")
            continue
        except (socket.timeout, TimeoutError):
            log(f"  Unit {unit:>3}: Timeout")
            dev.close()
            continue
        if suns != [0x5375, 0x6E53]:
            log(f"  Unit {unit:>3}: antwortet, aber kein SunSpec")
            continue
        saved = dev.unit
        dev.unit = unit
        try:
            base, _ = find_base(dev)
            common = dev.read(SUNS_BASE + 4, 32)
            typ = words_to_str(common[16:32])
            if base is None:
                log(f"  Unit {unit:>3}: '{typ}' - KEIN Model 124 (Nicht-Hybrid/Slave)")
            else:
                blk = dev.read(base, M124_LEN)
                wcha = scaled(blk[OFF["WChaMax"]], blk[OFF["WChaMax_SF"]])
                tag = "HYBRID mit Speicher" if wcha > 0 else "Model 124, aber WChaMax=0 (kein Speicher)"
                log(f"  Unit {unit:>3}: '{typ}' - Model 124 ab {base}, WChaMax {wcha:.0f} W -> {tag}")
                if wcha > 0 and hybrid is None:
                    hybrid = unit
        finally:
            dev.unit = saved
    if hybrid is not None:
        log(f"  -> MODBUS_UNIT_ID={hybrid} (Hybrid mit Speicher)")
    log("")


def step_reads(dev, args):
    log("== READS: Punkt 2/3/4 - Model-124-Block dekodieren ==")
    base = resolve_base(dev, args)
    m = Model124(dev, base)
    blk = m.block()
    d = m.decode(blk)
    log(f"  Basis {base}: ID {d['id']} (erwartet 124), L {d['len']} (erwartet 24)")
    if d["id"] != 124:
        log("  !! Kein Model 124 an dieser Adresse - Schritt chain ausfuehren.")
        return
    for name, off in OFF.items():
        raw = blk[off]
        extra = ""
        if name in ("OutWRte", "InWRte"):
            extra = f" -> {scaled(s16(raw), blk[OFF['InOutWRte_SF']]):+.0f} % von WChaMax"
        elif name == "WChaMax":
            extra = f" -> {d['wchamax_w']:.0f} W"
        elif name == "ChaState":
            extra = f" -> {d['soc_pct']:.1f} %"
        elif name == "MinRsvPct":
            extra = f" -> {d['minrsv_pct']:.1f} %"
        elif name == "ChaSt":
            extra = f" -> {CHAST.get(raw, '?')}"
        elif name.endswith("_SF"):
            extra = f" (SF {s16(raw)})"
        elif name == "StorCtl_Mod":
            extra = f" (Bit0 InWRte {'an' if raw & 1 else 'aus'}, Bit1 OutWRte {'an' if raw & 2 else 'aus'})"
        flag = "  [laut Registerkarte nicht unterstuetzt]" if name in NOT_SUPPORTED else ""
        log(f"    +{off:<2} {name:<18} raw {raw:>6}{extra}{flag}")
    log(f"  Erwartungen: WChaMax_SF 0 (M124_WCHAMAX_W_PER_UNIT=1), "
        f"InOutWRte_SF -2 (RAW_PER_PCT=100), ChaState_SF -2 (SOC_GAIN=0.01)")
    checks = [
        ("WChaMax_SF", s16(blk[OFF["WChaMax_SF"]]) == 0),
        ("InOutWRte_SF", s16(blk[OFF["InOutWRte_SF"]]) == -2),
        ("ChaState_SF", s16(blk[OFF["ChaState_SF"]]) == -2),
        ("WChaMax plausibel (500-50000 W)", 500 <= d["wchamax_w"] <= 50000),
    ]
    for label, ok in checks:
        log(f"  {'OK ' if ok else '!! '} {label}")
    soc_api = api_soc(args)
    if soc_api is None:
        _, soc_api = api_powerflow(args)
    if soc_api is not None:
        diff = abs(soc_api - d["soc_pct"])
        log(f"  SoC Modbus {d['soc_pct']:.1f} % vs. Solar API {soc_api:.1f} % "
            f"-> {'OK' if diff <= 2 else '!! Abweichung, MODBUS_SOC_GAIN pruefen'}")
    log("")


def step_watch(dev, args):
    log("== WATCH: alle 10 s (Ctrl+C beendet) ==")
    m = Model124(dev, resolve_base(dev, args))
    try:
        while True:
            log("  " + m.status_line(args))
            time.sleep(10)
    except KeyboardInterrupt:
        log("  Watch beendet.")


def _observe(m, args, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        log("  " + m.status_line(args))
        time.sleep(10)


def _pct_for(m, watts):
    d = m.decode(m.block())
    if d["wchamax_w"] <= 0:
        raise RuntimeError("WChaMax = 0 - kein Speicher an diesem Wechselrichter.")
    pct = max(1, min(100, round(watts / d["wchamax_w"] * 100)))
    return pct, d["wchamax_w"]


def do_reset(m):
    m.write("InWRte", 10000)
    m.write("OutWRte", 10000)
    m.write("StorCtl_Mod", 0)


def step_prevent(dev, args):
    log("== PREVENT: Punkt 5 - Ladesperre (Beispiel 2: InWRte=0, StorCtl_Mod=1) ==")
    log("  Pruefen waehrend der Sperre: Batterie laedt NICHT (auch bei PV-")
    log("  Ueberschuss, P_Akku nicht negativ), Entladung fuer den Haushalt")
    log("  bleibt moeglich, PV laeuft normal weiter.")
    m = Model124(dev, resolve_base(dev, args))
    if not confirm(args, "Ladesperre jetzt schreiben?"):
        return
    m.write("InWRte", 0)
    m.write("StorCtl_Mod", STORCTL_CHARGE_BIT)
    blk = m.block()
    log(f"  Read-back: StorCtl {blk[OFF['StorCtl_Mod']]} (erwartet 1), "
        f"InWRte {s16(blk[OFF['InWRte']])} (erwartet 0)")
    _observe(m, args, 20 if args.yes else 120)
    wait_enter(args, "Verhalten in Solar.web/an der Anzeige pruefen")
    step_reset(dev, args)


def _discharge(dev, args, both_bits):
    m = Model124(dev, resolve_base(dev, args))
    pct, wchamax = _pct_for(m, args.watts)
    variant = ("Beispiel 6: InWRte=-x, OutWRte=+x, StorCtl_Mod=3" if both_bits
               else "Gegenprobe: nur InWRte=-x, StorCtl_Mod=1")
    log(f"== DISCHARGE: Punkt 6 - {args.watts} W = {pct} % von WChaMax {wchamax:.0f} W ==")
    log(f"  Variante: {variant}")
    if not confirm(args, f"Entladung mit {pct} % jetzt schreiben?"):
        return
    m.write("InWRte", -pct * 100)
    if both_bits:
        m.write("OutWRte", pct * 100)
        m.write("StorCtl_Mod", STORCTL_CHARGE_BIT | STORCTL_DISCHARGE_BIT)
    else:
        m.write("StorCtl_Mod", STORCTL_CHARGE_BIT)
    blk = m.block()
    log(f"  Read-back: StorCtl {blk[OFF['StorCtl_Mod']]}, "
        f"InWRte {s16(blk[OFF['InWRte']])}, OutWRte {s16(blk[OFF['OutWRte']])}")
    log(f"  Erwartung: ChaSt DISCHARGING, P_Akku ~ +{pct * wchamax / 100:.0f} W "
        f"(Energiesparmodus: bis 10 min Anlauf - Punkt 10, Zeit notieren)")
    _observe(m, args, 20 if args.yes else 180)
    wait_enter(args, "AC-Leistung gegen Solar.web/Zaehler vergleichen")
    step_reset(dev, args)


def step_discharge(dev, args):
    _discharge(dev, args, both_bits=True)


def step_discharge_inonly(dev, args):
    _discharge(dev, args, both_bits=False)


def step_revert(dev, args):
    log("== REVERT: Punkt 7 - InOutWRte_RvrtTms (Registerkarte: Not supported) ==")
    m = Model124(dev, resolve_base(dev, args))
    before = m.raw("InOutWRte_RvrtTms")
    log(f"  RvrtTms vor dem Write: {before}")
    if not confirm(args, "RvrtTms = 120 schreiben (harmlos, nur Timeout)?"):
        return
    try:
        m.write("InOutWRte_RvrtTms", 120)
    except ModbusError as e:
        log(f"  Write abgewiesen: {e}")
        log("  -> wie erwartet: kein Auto-Revert, M124_HAS_RVRTTMS = false bleibt.")
        log("")
        return
    after = m.raw("InOutWRte_RvrtTms")
    log(f"  Write angenommen, Read-back: {after}")
    if after != 120:
        log("  -> Wert nicht gehalten: kein Auto-Revert, M124_HAS_RVRTTMS = false bleibt.")
        log("")
        return
    log("  !! Register haelt den Wert. Jetzt Ladesperre setzen und 3 min")
    log("  beobachten, ob StorCtl_Mod ohne weiteren Write auf 0 faellt.")
    if not confirm(args, "Ladesperre fuer den Ablauftest schreiben?"):
        return
    m.write("InWRte", 0)
    m.write("StorCtl_Mod", STORCTL_CHARGE_BIT)
    _observe(m, args, 30 if args.yes else 180)
    ctl = m.raw("StorCtl_Mod")
    log(f"  StorCtl_Mod nach Ablauf: {ctl} -> "
        + ("AUTO-REVERT WIRKT: M124_HAS_RVRTTMS = true setzen, rvrttms im "
           "Profil wieder beschreibbar machen" if ctl == 0
           else "kein Auto-Revert, M124_HAS_RVRTTMS = false bleibt"))
    step_reset(dev, args)


def step_failsafe(dev, args):
    log("== FAILSAFE: Verhalten ohne Master - Werte bleiben stehen? ==")
    log("  ACHTUNG: kommandiert eine Entladung und beendet sich OHNE Reset.")
    log("  Danach in Solar.web beobachten (Erwartung laut Registerkarte: die")
    log("  Entladung laeuft weiter, bis die Untergrenze erreicht ist).")
    log("  Aufraeumen danach IMMER mit:  spike_datamanager.py <ip> reset")
    m = Model124(dev, resolve_base(dev, args))
    pct, _ = _pct_for(m, args.watts)
    if not confirm(args, f"Entladung ({pct} %) stehen lassen?"):
        return
    m.write("InWRte", -pct * 100)
    m.write("OutWRte", pct * 100)
    m.write("StorCtl_Mod", STORCTL_CHARGE_BIT | STORCTL_DISCHARGE_BIT)
    log("  Kommando steht. Skript beendet sich jetzt OHNE Reset.")
    dev.close()
    sys.exit(0)


def step_reset(dev, args):
    log("== RESET: InWRte 100 %, OutWRte 100 %, StorCtl_Mod 0 ==")
    m = Model124(dev, resolve_base(dev, args))
    do_reset(m)
    blk = m.block()
    log(f"  Read-back: StorCtl {blk[OFF['StorCtl_Mod']]}, "
        f"InWRte {s16(blk[OFF['InWRte']])}, OutWRte {s16(blk[OFF['OutWRte']])} "
        + ("OK" if blk[OFF["StorCtl_Mod"]] == 0 else "!! StorCtl nicht 0"))
    log("")


STEPS = {
    "chain": step_chain,
    "units": step_units,
    "reads": step_reads,
    "watch": step_watch,
    "prevent": step_prevent,
    "discharge": step_discharge,
    "discharge-inonly": step_discharge_inonly,
    "revert": step_revert,
    "failsafe": step_failsafe,
    "reset": step_reset,
}
CONTROLLING = {"prevent", "discharge", "discharge-inonly", "revert", "failsafe"}


def main():
    global LOG_FILE
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("host", help="IP des Datamanagers")
    parser.add_argument("steps", nargs="*", default=["chain"],
                        choices=list(STEPS), help="Schritte (Vorgabe: chain)")
    parser.add_argument("--port", type=int, default=502)
    parser.add_argument("--unit", type=int, default=1,
                        help="Unit-ID = Wechselrichter-Nummer des Hybrid (Vorgabe 1)")
    parser.add_argument("--base", type=int, default=None,
                        help="Basis von Model 124 erzwingen (sonst per Kette ermittelt)")
    parser.add_argument("--watts", type=int, default=1000,
                        help="Entladeleistung fuer discharge/failsafe (W)")
    parser.add_argument("--api-host", default=None,
                        help="Host der Solar API, falls nicht der Modbus-Host")
    parser.add_argument("--no-api", action="store_true",
                        help="Solar-API-Gegenprobe ueberspringen (Simulator)")
    parser.add_argument("--yes", action="store_true",
                        help="Bestaetigungen ueberspringen (Simulator-Tests)")
    parser.add_argument("--log", default="spike_datamanager.log")
    args = parser.parse_args()
    if not args.steps:
        args.steps = ["chain"]

    LOG_FILE = open(args.log, "a")
    log(f"=== Spike {args.host}:{args.port} Unit {args.unit} "
        f"Schritte: {', '.join(args.steps)} ===")

    dev = Datamanager(args.host, args.port, args.unit)
    controlled = False
    try:
        dev.connect()
        log(f"Verbunden mit {args.host}:{args.port}.")
        for name in args.steps:
            if name in CONTROLLING:
                controlled = True
            STEPS[name](dev, args)
        log("Fertig. Befunde in die Registertabelle im README eintragen.")
    except KeyboardInterrupt:
        log("Abbruch (Ctrl+C).")
        if controlled:
            log("Sicherheits-Reset ...")
            try:
                do_reset(Model124(dev, resolve_base(dev, args)))
            except Exception as e:
                log(f"!! Reset fehlgeschlagen: {e} - von Hand: Schritt reset")
        sys.exit(1)
    except (OSError, ModbusError, ConnectionError, RuntimeError) as e:
        log(f"FEHLER: {e}")
        if controlled:
            log("Sicherheits-Reset ...")
            try:
                do_reset(Model124(dev, resolve_base(dev, args)))
            except Exception as e2:
                log(f"!! Reset fehlgeschlagen: {e2} - von Hand: Schritt reset")
        sys.exit(1)
    finally:
        dev.close()


if __name__ == "__main__":
    main()
