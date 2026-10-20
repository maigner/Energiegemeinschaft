#!/usr/bin/env python3
"""Spike-Werkzeug fuer die Victron-GX-Registerverifikation (README, Punkte 2-9).

Arbeitet die Spike-Checkliste des Profils victron direkt gegen das GX-Geraet
(Cerbo GX, Venus GX, ...) ab - VOR der ersten IBM-Installation, ohne
openHAB. Nur Standardbibliothek (laeuft auf dem Pi wie am Laptop), Modbus
TCP an Unit-ID 100 (Systemebene), Halteregister: Lesen FC03, Schreiben
FC06 - literal adressiert, exakt wie das Profil.

Schritte (einzeln oder kombiniert aufrufbar):

    reads      Punkt 2+3(lesen): Seriennummer, Batteriewerte, ESS-Settings,
               ESS-Modus lesen, dekodieren, Plausibilitaet pruefen. Merkt
               Setpoint (2700) und DVCC-Limit (2705) als Werkswerte fuer
               reset (Zustandsdatei --state). Read-only.
    watch      SoC / Batterie-, Netz-, PV-Leistung alle 10 s lesen
               (Vergleich mit der Remote Console, Punkt 8 Minimum SoC).
    setpoint   Punkt 3+4: grid setpoint (2700) auf --setpoint schreiben,
               Read-back, Netzleistung beobachten, Original zurueck.
               Liest dazu das 3.50+-Override (2716/2717), falls vorhanden.
    prevent    Punkt 5+6: Ladesperre (2705 = 0). Pruefen: Batterie laedt
               NICHT, auch nicht ueber die MPPTs (DC-PV-Ueberschuss).
               Steht bis Enter, dann Reset.
    limit      Punkt 5: Laderegelung (2705 = --amps). Ladeleistung soll
               sich auf ~ Ampere x Batteriespannung einpendeln; gemessene
               Spannung -> VIC_BATTERY_VOLTAGE_V. Steht bis Enter, dann Reset.
    discharge  Punkt 7: forcierte Entladung (2700 = -(--watts), Ladestrom
               frei). Steht bis Enter, dann Reset. Netz- und Batterie-
               leistung werden mitgelesen.
    failsafe   Punkt 9: Entladung kommandieren und OHNE Reset beenden -
               danach Modbus-Master trennen und beobachten (Erwartung:
               Setpoint bleibt stehen, Entladung endet erst am Minimum SoC).
               Aufraeumen: Schritt reset.
    reset      Werkswerte zurueckschreiben (2700 + 2705 aus der Zustands-
               datei, sonst Vorgaben 50 W / -1 wie der Adapter).

Beispiele:

    python3 spike_venus.py 192.168.1.50 reads
    python3 spike_venus.py 192.168.1.50 setpoint prevent discharge --watts 2000
    python3 spike_venus.py 127.0.0.1 --port 5020 --yes reads setpoint   # Simulator
    python3 spike_venus.py 192.168.1.50 reset

Jeder steuernde Schritt fragt vorher nach Bestaetigung (--yes unterdrueckt
das, fuer den Simulator). Bei Ctrl+C oder Fehlern werden die Werkswerte
zurueckgeschrieben - ausser im Schritt failsafe, der das Stehenlassen will.
Alle Ausgaben landen zusaetzlich in --log (Vorgabe: spike_venus.log).

Voraussetzung am GX (Remote Console): Settings -> Services -> Modbus TCP
aktiv; ESS-Assistent im Modus "Optimiert" (ESS Mode 1/2, nicht 3 =
Externe Steuerung, BatteryLife state nicht 9 = Batterien geladen halten).
"""

import argparse
import datetime
import json
import os
import socket
import struct
import sys
import time

# Registerkarte (Systemebene, Unit-ID 100) - muss profile.sh entsprechen.
# Quelle: dbus_modbustcp attributes.csv (com.victronenergy.system).
REG_SERIAL = 800            # String[6], 12 ASCII-Zeichen
REG_AC_CONS_L1 = 814        # U16 W, L1..L3 (814..816) - nur informativ
REG_GRID_L1 = 817           # S16 W, L1..L3 (817..819), + Bezug / - Einspeisung
REG_PV_DC = 826             # U16 W, DC-gekoppelte PV (MPPT) - nur informativ
REG_BAT_VOLTAGE = 840       # U16, V * 10
REG_BAT_CURRENT = 841       # S16, A * 10
REG_BAT_POWER = 842         # S16, W (+ laden, - entladen)
REG_SOC = 843               # U16, %
REG_BAT_STATE = 844         # U16, 0 idle / 1 laden / 2 entladen
REG_SETPOINT = 2700         # S16, W (+ Netzbezug, - Einspeisung)
REG_MAX_DIS_POWER = 2704    # U16, W / 10, -1 = unbegrenzt
REG_MAX_CHARGE_A = 2705     # S16, A; -1 = unbegrenzt, 0 = Ladesperre
REG_MAX_FEED_IN = 2706      # S16, W / 100; -1 = unbegrenzt
REG_FEED_DC_PV = 2707       # U16, 0/1
REG_NO_FEED_AC_PV = 2708    # U16, 0/1
REG_SETPOINT_OVR = 2716     # S32 (2716/2717), Setpoint-Override ab Venus 3.50
REG_BL_STATE = 2900         # U16, 9 = Batterien geladen halten
REG_MIN_SOC = 2901          # U16, % * 10
REG_ESS_MODE = 2902         # U16, 1/2 = ESS, 3 = Externe Steuerung

DEFAULT_SETPOINT_W = 50     # wie VIC_DEFAULT_GRID_SETPOINT_W im Adapter
DEFAULT_MAX_CHARGE_A = -1   # wie VIC_DEFAULT_MAX_CHARGE_A im Adapter

ESS_MODE_NAMES = {0: "(unbekannt/kein ESS)", 1: "ESS mit Phasenkompensation",
                  2: "ESS ohne Phasenkompensation", 3: "EXTERNE STEUERUNG"}
BL_STATE_NAMES = {0: "BatteryLife deaktiviert", 1: "Rueckhalt (Restarting)",
                  2: "Eigenverbrauch (Self-consumption)", 3: "Eigenverbrauch",
                  4: "Eigenverbrauch", 5: "Entladen deaktiviert", 6: "Langsam laden",
                  7: "Erhaltung (Sustain)", 8: "Nachladen", 9: "BATTERIEN GELADEN HALTEN",
                  10: "Optimiert ohne BatteryLife (Keep charged aus)",
                  11: "Entladen deaktiviert", 12: "Nachladen"}
BAT_STATE_NAMES = {0: "idle", 1: "laedt", 2: "entlaedt"}

REQUEST_PAUSE_S = 0.2

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
             10: "Gateway path unavailable", 11: "Gateway target failed to respond"}

    def __init__(self, fc, code):
        self.fc, self.code = fc, code
        name = self.CODES.get(code, f"Code {code}")
        super().__init__(f"Modbus-Exception auf FC{fc}: {name}")


class VenusGX:
    """Minimaler Modbus-TCP-Client (FC03 lesen, FC06 schreiben)."""

    def __init__(self, host, port, unit, timeout=3.0):
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

    def _request(self, pdu):
        wait = REQUEST_PAUSE_S - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        if self.sock is None:
            self.connect()
        self.tid = (self.tid + 1) % 0xFFFF
        frame = struct.pack(">HHHB", self.tid, 0, len(pdu) + 1, self.unit) + pdu
        self.sock.sendall(frame)
        header = self._recvall(7)
        _tid, _proto, length, unit = struct.unpack(">HHHB", header)
        resp = self._recvall(length - 1)
        self.last_request = time.monotonic()
        if unit != self.unit:
            raise ConnectionError(f"Antwort von falscher Unit-ID {unit}")
        if resp[0] & 0x80:
            raise ModbusError(resp[0] & 0x7F, resp[1])
        return resp

    def read(self, address, count):
        """FC03 (Holding-Register) - Victron liest ALLE Register so."""
        resp = self._request(struct.pack(">BHH", 3, address, count))
        return list(struct.unpack(f">{count}H", resp[2:2 + count * 2]))

    def read_s16(self, address):
        return s16(self.read(address, 1)[0])

    def write_s16(self, address, value):
        """FC06; negative Werte als Zweierkomplement (wie das Binding)."""
        if not -32768 <= value <= 65535:
            raise ValueError(f"Wert {value} passt nicht in ein 16-Bit-Register")
        self._request(struct.pack(">BHH", 6, address, value & 0xFFFF))
        log(f"  WRITE {address} = {value} (FC06)")


def s16(v):
    return v - 0x10000 if v >= 0x8000 else v


def s32_be(words):
    v = (words[0] << 16) | words[1]
    return v - 0x100000000 if v >= 0x80000000 else v


def decode_serial(words):
    raw = b"".join(struct.pack(">H", w) for w in words)
    return raw.decode("ascii", errors="replace").strip("\x00 ")


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


# --- Werkswerte (Zustandsdatei) ----------------------------------------------

def load_state(args):
    try:
        with open(args.state) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def remember_factory(dev, args):
    """Setpoint + DVCC-Limit beim ERSTEN Kontakt merken (wie 06-verify.sh)."""
    state = load_state(args)
    if "setpoint_w" in state and "max_charge_a" in state:
        return state
    state = {"setpoint_w": dev.read_s16(REG_SETPOINT),
             "max_charge_a": dev.read_s16(REG_MAX_CHARGE_A),
             "host": args.host,
             "remembered_at": datetime.datetime.now().isoformat(timespec="seconds")}
    with open(args.state, "w") as f:
        json.dump(state, f, indent=2)
    log(f"  Werkswerte gemerkt in {args.state}: setpoint {state['setpoint_w']} W, "
        f"MaxChargeCurrent {state['max_charge_a']} A")
    return state


def factory_values(args):
    state = load_state(args)
    sp = args.reset_setpoint if args.reset_setpoint is not None \
        else state.get("setpoint_w", DEFAULT_SETPOINT_W)
    amps = args.reset_amps if args.reset_amps is not None \
        else state.get("max_charge_a", DEFAULT_MAX_CHARGE_A)
    if "setpoint_w" not in state and args.reset_setpoint is None:
        log(f"  Hinweis: keine Zustandsdatei ({args.state}) - Reset mit "
            f"Vorgaben {DEFAULT_SETPOINT_W} W / {DEFAULT_MAX_CHARGE_A} A wie der Adapter.")
    return sp, amps


# --- Messwerte ---------------------------------------------------------------

def snapshot(dev):
    bat = dev.read(REG_BAT_VOLTAGE, 5)          # 840..844
    grid = dev.read(REG_GRID_L1, 3)             # 817..819
    cons = dev.read(REG_AC_CONS_L1, 3)          # 814..816
    pv_dc = dev.read(REG_PV_DC, 1)[0]
    sp = dev.read_s16(REG_SETPOINT)
    amps = dev.read_s16(REG_MAX_CHARGE_A)
    return {
        "voltage": bat[0] / 10, "current": s16(bat[1]) / 10, "power": s16(bat[2]),
        "soc": bat[3], "state": bat[4],
        "grid": sum(s16(g) for g in grid), "grid_l": [s16(g) for g in grid],
        "cons": sum(cons), "pv_dc": pv_dc, "setpoint": sp, "max_charge_a": amps,
    }


def fmt(s):
    return (f"SoC {s['soc']} %  Bat {s['power']:+d} W ({s['voltage']:.1f} V, "
            f"{s['current']:+.1f} A, {BAT_STATE_NAMES.get(s['state'], s['state'])})  "
            f"Netz {s['grid']:+d} W  Verbrauch {s['cons']} W  PV-DC {s['pv_dc']} W  "
            f"Setpoint {s['setpoint']} W  MaxCharge {s['max_charge_a']} A")


def observe(dev, args, seconds=None, label=""):
    if seconds is None:
        seconds = args.observe if args.observe is not None else (30 if args.yes else 120)
    end = time.monotonic() + seconds
    samples = []
    while True:
        s = snapshot(dev)
        samples.append(s)
        log(f"  {label}{fmt(s)}")
        if time.monotonic() >= end:
            return samples
        time.sleep(min(10, max(0.0, end - time.monotonic())) or 0.01)


def read_override(dev):
    """2716/2717 (Setpoint-Override ab Venus 3.50) - fehlt auf aelteren Versionen."""
    try:
        words = dev.read(REG_SETPOINT_OVR, 2)
    except ModbusError as e:
        if e.code == 2:
            return None
        raise
    return s32_be(words)


# --- Schritte ---------------------------------------------------------------

def step_reads(dev, args):
    log("== READS: Punkt 2/3 - Register lesen und dekodieren ==")
    serial = decode_serial(dev.read(REG_SERIAL, 6))
    log(f"  Seriennummer GX (800): '{serial}' "
        + ("OK" if len(serial) >= 8 and serial.isalnum() else "!! unplausibel - richtiges Geraet/Unit-ID?"))

    s = snapshot(dev)
    log(f"  Batteriespannung (840): {s['voltage']:.1f} V  "
        + ("-> 48-V-System, VIC_BATTERY_VOLTAGE_V=50 passt" if 40 <= s['voltage'] <= 60
           else "!! kein 48-V-System? VIC_BATTERY_VOLTAGE_V im Adapter anpassen"))
    log(f"  Batteriestrom (841): {s['current']:+.1f} A")
    log(f"  Batterieleistung (842): {s['power']:+d} W  (Victron: + laden, - entladen;"
        f" Zustand 844 = {BAT_STATE_NAMES.get(s['state'], s['state'])} -> Vorzeichen bestaetigen,"
        f" MODBUS_BATTERY_POWER_GAIN=-1)")
    log(f"  Ladestand (843): {s['soc']} %  (mit Remote Console vergleichen; Gain-Erwartung 1)")
    if not 0 <= s['soc'] <= 100:
        log("  !! SoC unplausibel - falsches Geraet oder falsche Registerkarte?")
    log(f"  Netzleistung (817..819): {s['grid']:+d} W  L1/L2/L3 {s['grid_l']}  "
        f"(+ Bezug / - Einspeisung; 0 = kein Netzzaehler am GX?)")
    log(f"  AC-Verbrauch (814..816): {s['cons']} W   PV DC-gekoppelt (826): {s['pv_dc']} W")

    log("  -- ESS-Settings (2700..2708) --")
    ess = dev.read(REG_SETPOINT, 9)
    log(f"  ESS grid setpoint (2700): {s16(ess[0])} W  (Remote Console: Netz-Sollwert, Vorgabe 50)")
    log(f"  MaxChargePercentage (2701): {ess[1]} %   MaxDischargePercentage (2702): {ess[2]} %")
    mdp = ess[4]
    log(f"  ESS MaxDischargePower (2704): raw={mdp} -> "
        + ("unbegrenzt" if mdp == 0xFFFF else f"{mdp * 10} W"))
    mca = s16(ess[5])
    log(f"  DVCC MaxChargeCurrent (2705): {mca} A "
        + ("(unbegrenzt)" if mca == -1 else "(0 = LADESPERRE AKTIV!)" if mca == 0 else "(LIMIT AKTIV - Werkswert?)"))
    mfi = s16(ess[6])
    log(f"  ESS MaxFeedInPower (2706): raw={mfi} -> "
        + ("unbegrenzt" if mfi == -1 else f"{mfi * 100} W  !! Einspeiselimit - kann forcierte Entladung deckeln (Punkt 7)"))
    log(f"  DC-PV-Ueberschuss einspeisen (2707): {ess[7]}  "
        + ("<- AKTIV: DVCC-Limit gilt laut Doku NICHT fuer MPPTs -> Punkt 6 entscheidend" if ess[7] == 1 else ""))
    log(f"  AC-PV-Ueberschuss NICHT einspeisen (2708): {ess[8]}")

    ovr = read_override(dev)
    if ovr is None:
        log("  Setpoint-Override (2716/2717): nicht vorhanden (Venus < 3.50 oder Register fehlt) -> 2700 ist der Steuerweg")
    else:
        log(f"  Setpoint-Override (2716/2717): {ovr} W  <- Venus 3.50+: Punkt 4 pruefen, ob 2700 trotzdem wirkt")

    log("  -- ESS-Modus (2900..2902) --")
    mode = dev.read(REG_BL_STATE, 3)
    log(f"  BatteryLife state (2900): {mode[0]} = {BL_STATE_NAMES.get(mode[0], '?')}"
        + ("  !! Entladung waere sinnlos - auf 'Optimiert' stellen" if mode[0] == 9 else ""))
    log(f"  ESS Minimum SoC (2901): raw={mode[1]} -> {mode[1] / 10:.1f} %  (harter Boden, Gain 10)")
    log(f"  ESS Mode (2902): {mode[2]} = {ESS_MODE_NAMES.get(mode[2], '?')}"
        + ("  !! Modus 3 = Externe Steuerung - Settings-Register wirkungslos" if mode[2] == 3
           else "  OK" if mode[2] in (1, 2) else "  !! unerwartet"))
    remember_factory(dev, args)
    log("")


def step_watch(dev, args):
    log("== WATCH: alle 10 s (Ctrl+C beendet) ==")
    try:
        while True:
            log("  " + fmt(snapshot(dev)))
            time.sleep(10)
    except KeyboardInterrupt:
        log("  Watch beendet.")


def guard(dev, args, what):
    """Wie __ibmVicGuard: Modus 3 / 'geladen halten' blocken, sonst bestaetigen."""
    remember_factory(dev, args)
    mode = dev.read(REG_BL_STATE, 3)
    if mode[2] == 3:
        log("  !! ESS Mode 3 (Externe Steuerung) - Settings-Register wirken nicht. Abbruch.")
        return False
    if mode[0] == 9:
        log("  !! BatteryLife 'Batterien geladen halten' - Test waere wirkungslos.")
        if not confirm(args, "Trotzdem fortfahren?"):
            return False
    return confirm(args, what)


def step_setpoint(dev, args):
    log(f"== SETPOINT: Punkt 3+4 - grid setpoint (2700) auf {args.setpoint} W, dann zurueck ==")
    before = dev.read_s16(REG_SETPOINT)
    ovr_before = read_override(dev)
    log(f"  Vorher: 2700 = {before} W"
        + (f", Override 2716 = {ovr_before} W" if ovr_before is not None else ""))
    if not guard(dev, args, f"Setpoint jetzt auf {args.setpoint} W schreiben (unkritisch)?"):
        return
    dev.write_s16(REG_SETPOINT, args.setpoint)
    time.sleep(2)
    after = dev.read_s16(REG_SETPOINT)
    log(f"  Read-back 2700 = {after} W "
        + ("OK" if after == args.setpoint else "!! Wert nicht uebernommen"))
    log("  Remote Console (Settings -> ESS -> Netz-Sollwert) muss den Wert zeigen;")
    log(f"  die Netzleistung soll sich auf ~{args.setpoint:+d} W einpendeln:")
    observe(dev, args)
    ovr_after = read_override(dev)
    if ovr_after is not None:
        log(f"  Override 2716 nach dem Schreiben: {ovr_after} W "
            + ("(unveraendert)" if ovr_after == ovr_before else "!! hat sich mitgeaendert"))
        log("  Venus 3.50+: folgt die Regelung dem Wert auf 2700? Falls nicht -> Profil auf 2716 (int32) umstellen.")
    wait_enter(args, "Remote Console / Netzleistung pruefen")
    log(f"  Original ({before} W) zurueckschreiben ...")
    dev.write_s16(REG_SETPOINT, before)
    log("")


def step_prevent(dev, args):
    log("== PREVENT: Punkt 5+6 - Ladesperre (2705 = 0) ==")
    log("  Pruefen waehrend der Sperre: Batterieleistung bleibt <= 0 (laedt NICHT,")
    log("  auch nicht bei PV-Ueberschuss ueber die MPPTs = Go/No-Go Punkt 6);")
    log("  PV versorgt Haus und Netz weiter; Entladen fuer den Haushalt bleibt erlaubt.")
    if not guard(dev, args, "Ladesperre jetzt kommandieren?"):
        return
    dev.write_s16(REG_MAX_CHARGE_A, 0)
    samples = observe(dev, args)
    max_charge = max(s["power"] for s in samples)
    pv = max(s["pv_dc"] for s in samples)
    if max_charge > 50:
        log(f"  !! Batterie lud waehrend der Sperre mit bis zu {max_charge:+d} W"
            + (f" bei PV-DC {pv} W - DVCC-Limit wirkt NICHT auf die MPPTs (README Punkt 6: /Hub4/DisableCharge pruefen)"
               if pv > 0 else " - Ladesperre unwirksam?"))
    else:
        log(f"  Batterie lud nicht (max {max_charge:+d} W"
            + (f", PV-DC bis {pv} W -> MPPTs respektieren DVCC" if pv > 0
               else ", ABER kein PV-Ueberschuss - Punkt 6 bei Sonne wiederholen") + ")")
    wait_enter(args, "Verhalten in der Remote Console pruefen")
    step_reset(dev, args)


def step_limit(dev, args):
    log(f"== LIMIT: Punkt 5 - Laderegelung (2705 = {args.amps} A) ==")
    log(f"  Erwartung: Ladeleistung pendelt sich auf ~{args.amps} A x Batteriespannung ein")
    log("  (nur sichtbar, wenn gerade PV-Ueberschuss zum Laden da ist).")
    if not guard(dev, args, f"Ladestrom jetzt auf {args.amps} A begrenzen?"):
        return
    dev.write_s16(REG_MAX_CHARGE_A, args.amps)
    samples = observe(dev, args)
    v = sum(s["voltage"] for s in samples) / len(samples)
    charging = [s for s in samples if s["power"] > 50]
    if charging:
        p = sum(s["power"] for s in charging) / len(charging)
        log(f"  Mittlere Ladeleistung {p:.0f} W bei {v:.1f} V -> {p / v:.1f} A "
            f"(Soll {args.amps} A); VIC_BATTERY_VOLTAGE_V = {round(v)} eintragen")
    else:
        log(f"  Batterie lud nicht (kein Ueberschuss?) - Batteriespannung {v:.1f} V -> VIC_BATTERY_VOLTAGE_V = {round(v)}")
    wait_enter(args, "Ladeleistung in der Remote Console pruefen")
    step_reset(dev, args)


def _discharge(dev, args):
    """Kommando-Sequenz wie ibmForceDischarge: Ladestrom frei, Setpoint negativ."""
    _sp, amps = factory_values(args)
    dev.write_s16(REG_MAX_CHARGE_A, amps)
    dev.write_s16(REG_SETPOINT, -args.watts)


def step_discharge(dev, args):
    log(f"== DISCHARGE: Punkt 7 - forcierte Entladung, Setpoint = {-args.watts} W ==")
    log(f"  Erwartung: Netzleistung ~{-args.watts:+d} W (Export), Batterie liefert")
    log("  Export + Haushalt. Ueber der Nennleistung: stilles Klemmen dokumentieren.")
    log("  Einspeiselimit (2706) / AC-PV-Regel (2708) duerfen den Export nicht deckeln.")
    if not guard(dev, args, f"Entladung mit {args.watts} W Netz-Export jetzt kommandieren?"):
        return
    _discharge(dev, args)
    samples = observe(dev, args)
    grid = min(s["grid"] for s in samples)
    bat = min(s["power"] for s in samples)
    log(f"  Minimum Netz {grid:+d} W (Soll {-args.watts:+d}), Batterie {bat:+d} W "
        + ("-> Export erreicht" if grid <= -args.watts * 0.9 else "!! Export nicht erreicht - Limit/Nennleistung/Zaehler pruefen"))
    log("  Punkt 8 (Minimum SoC): Entladung laenger stehen lassen (--observe) und")
    log("  beobachten, dass sie am ESS-Minimum-SoC von selbst endet.")
    wait_enter(args, "Export gegen Remote Console/Zaehler vergleichen")
    step_reset(dev, args)


def step_failsafe(dev, args):
    log("== FAILSAFE: Punkt 9 - Verhalten bei Master-Verlust ==")
    log("  ACHTUNG: Dieses Skript kommandiert eine Entladung und beendet sich")
    log("  OHNE Reset. Danach: Verbindung getrennt lassen und in der Remote")
    log("  Console beobachten. Erwartung laut Fail-Safe-Analyse: der Setpoint")
    log("  BLEIBT stehen (kein Auto-Revert), Entladung endet erst am Minimum SoC.")
    log("  Faellt er doch zurueck: Zeit notieren (waere ein echtes Auto-Revert).")
    log("  Aufraeumen danach IMMER mit:  spike_venus.py <ip> reset")
    if not guard(dev, args, f"Entladung ({args.watts} W) stehen lassen?"):
        return
    _discharge(dev, args)
    log("  Kommando steht. Skript beendet sich jetzt OHNE Reset.")
    dev.close()
    sys.exit(0)


def step_reset(dev, args):
    sp, amps = factory_values(args)
    log(f"== RESET: Werkswerte zurueck (2700 = {sp} W, 2705 = {amps} A) ==")
    dev.write_s16(REG_SETPOINT, sp)
    dev.write_s16(REG_MAX_CHARGE_A, amps)
    time.sleep(2)
    got_sp, got_a = dev.read_s16(REG_SETPOINT), dev.read_s16(REG_MAX_CHARGE_A)
    log(f"  Read-back: 2700 = {got_sp} W, 2705 = {got_a} A "
        + ("OK" if (got_sp, got_a) == (sp, amps) else "!! weicht ab"))
    log("")


STEPS = {
    "reads": step_reads,
    "watch": step_watch,
    "setpoint": step_setpoint,
    "prevent": step_prevent,
    "limit": step_limit,
    "discharge": step_discharge,
    "failsafe": step_failsafe,
    "reset": step_reset,
}
CONTROLLING = {"setpoint", "prevent", "limit", "discharge", "failsafe"}


def safety_reset(dev, args):
    log("Sicherheits-Reset ...")
    try:
        dev.close()
        dev.connect()
        sp, amps = factory_values(args)
        dev.write_s16(REG_SETPOINT, sp)
        dev.write_s16(REG_MAX_CHARGE_A, amps)
    except Exception as e:
        log(f"!! Reset fehlgeschlagen: {e} - von Hand: Schritt reset")


def main():
    global LOG_FILE
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("host", help="IP des GX-Geraets")
    parser.add_argument("steps", nargs="*", default=["reads"],
                        choices=list(STEPS), help="Schritte (Vorgabe: reads)")
    parser.add_argument("--port", type=int, default=502)
    parser.add_argument("--unit", type=int, default=100,
                        help="Unit-ID (Vorgabe 100 = Systemebene)")
    parser.add_argument("--setpoint", type=int, default=100,
                        help="Testwert fuer den Schritt setpoint (W, Vorgabe 100)")
    parser.add_argument("--amps", type=int, default=10,
                        help="Ladestromlimit fuer den Schritt limit (A, Vorgabe 10)")
    parser.add_argument("--watts", type=int, default=1000,
                        help="Netz-Export fuer discharge/failsafe (W, Vorgabe 1000)")
    parser.add_argument("--observe", type=int, default=None,
                        help="Beobachtungsdauer je Kommando in s (Vorgabe 120; 30 mit --yes)")
    parser.add_argument("--reset-setpoint", type=int, default=None,
                        help="Werkswert fuer 2700 erzwingen (statt Zustandsdatei)")
    parser.add_argument("--reset-amps", type=int, default=None,
                        help="Werkswert fuer 2705 erzwingen (statt Zustandsdatei)")
    parser.add_argument("--yes", action="store_true",
                        help="Bestaetigungen ueberspringen (Simulator-Tests)")
    parser.add_argument("--log", default="spike_venus.log",
                        help="Logdatei (Vorgabe: spike_venus.log)")
    parser.add_argument("--state", default="spike_venus.state.json",
                        help="Zustandsdatei mit den gemerkten Werkswerten")
    args = parser.parse_args()
    if not args.steps:
        args.steps = ["reads"]
    if args.watts < 0 or args.watts > 32000:
        parser.error("--watts muss zwischen 0 und 32000 liegen (int16-Setpoint)")

    LOG_FILE = open(args.log, "a")
    log(f"=== Spike {args.host}:{args.port} Unit {args.unit} "
        f"Schritte: {', '.join(args.steps)} ===")

    dev = VenusGX(args.host, args.port, args.unit)
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
            safety_reset(dev, args)
        sys.exit(1)
    except (OSError, ModbusError, ConnectionError, ValueError) as e:
        log(f"FEHLER: {e}")
        if controlled:
            safety_reset(dev, args)
        sys.exit(1)
    finally:
        dev.close()


if __name__ == "__main__":
    main()
