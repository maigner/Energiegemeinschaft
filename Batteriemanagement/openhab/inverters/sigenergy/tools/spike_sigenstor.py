#!/usr/bin/env python3
"""Spike-Werkzeug fuer die SigenStor-Registerverifikation (README, Punkte 2-9).

Arbeitet die Spike-Checkliste des Profils sigenergy direkt gegen die Anlage
ab - VOR der ersten IBM-Installation, ohne openHAB. Nur Standardbibliothek
(laeuft auf dem Pi wie am Laptop), Modbus TCP an Slave 247, Reads per FC04,
Writes per FC06/FC16, literal adressiert - exakt wie das Profil.

Schritte (einzeln oder kombiniert aufrufbar):

    reads      Punkt 2+3+7: alle Register lesen, dekodieren (beide
               U32-Wortreihenfolgen), Plausibilitaet pruefen. Read-only.
    watch      SoC / ESS-Leistung alle 10 s lesen (Vergleich mit der App).
    toggle     Punkt 4: Remote EMS ein (40029=1), pruefen dass der
               EMS-Modus (30003) auf 7 springt, wieder aus.
    prevent    Punkt 6: Ladesperre (Modus 5 + Entladelimit 0 + PV-Limit
               freigeben). Steht bis Enter, dann Reset.
    discharge  Punkt 8: forcierte Entladung (Modus 6 + --watts). Steht bis
               Enter, dann Reset. ESS-Leistung wird dabei mitgelesen.
    failsafe   Punkt 9: Entladung kommandieren und OHNE Reset beenden -
               danach dieses Skript beenden/Netz trennen und beobachten, ob
               die Anlage von selbst zurueckfaellt. Aufraeumen: Schritt reset.
    reset      Remote EMS aus (40029=0) - Werksverhalten.

Beispiele:

    python3 spike_sigenstor.py 192.168.1.50 reads
    python3 spike_sigenstor.py 192.168.1.50 toggle prevent discharge --watts 2000
    python3 spike_sigenstor.py 127.0.0.1 --port 5020 --yes reads toggle   # Simulator
    python3 spike_sigenstor.py 192.168.1.50 reset

Jeder steuernde Schritt fragt vorher nach Bestaetigung (--yes unterdrueckt
das, fuer den Simulator). Bei Ctrl+C oder Fehlern wird Remote EMS
zurueckgesetzt - ausser im Schritt failsafe, der das Stehenlassen will.
Alle Ausgaben landen zusaetzlich in --log (Vorgabe: spike_sigenstor.log).

Voraussetzung an der Anlage (mySigen-App, ggf. Installateur-Zugang):
"ModBus TCP Server Enable" und "Remote EMS Scheduling Enable" aktiv.
"""

import argparse
import datetime
import socket
import struct
import sys
import time

# Registerkarte (Anlagenebene, Slave 247) - muss profile.sh entsprechen
REG_EMS_MODE = 30003        # U16, 7 = Remote EMS aktiv
REG_MAX_ACTIVE = 30010      # U32, W (Gain 1000 auf kW)
REG_SOC = 30014             # U16, % * 10
REG_ESS_POWER = 30037       # S32, W (> 0 laden, < 0 entladen)
REG_RATED_CHARGE = 30068    # U32, W
REG_RATED_DISCHARGE = 30070 # U32, W
REG_RMT_ENABLE = 40029      # U16, 0/1
REG_RMT_MODE = 40031        # U16, Appendix 6
REG_CHG_LIMIT = 40032       # U32, W (Modus 3/4)
REG_DIS_LIMIT = 40034       # U32, W (Modus 5/6)
REG_PV_LIMIT = 40036        # U32, W (Modus 3-6)

MODE_NAMES = {
    0: "PCS remote control",
    1: "Standby",
    2: "Maximum self-consumption",
    3: "Command charging (grid first)",
    4: "Command charging (PV first)",
    5: "Command discharging (PV first)",
    6: "Command discharging (ESS first)",
}
EMS_WORK_MODE_REMOTE = 7

# Protokoll 4.2: Minimum request period 1000 ms
REQUEST_PAUSE_S = 1.0

LOG_FILE = None


def log(msg=""):
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    line = f"[{stamp}] {msg}" if msg else ""
    print(line, flush=True)
    if LOG_FILE:
        LOG_FILE.write(line + "\n")
        LOG_FILE.flush()


class SigenStor:
    """Minimaler Modbus-TCP-Client (FC04 lesen, FC06/FC16 schreiben)."""

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
        # Mindestabstand zwischen Requests (Protokoll 4.2)
        wait = REQUEST_PAUSE_S - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        if self.sock is None:
            self.connect()
        self.tid = (self.tid + 1) % 0xFFFF
        frame = struct.pack(">HHHB", self.tid, 0, len(pdu) + 1, self.unit) + pdu
        self.sock.sendall(frame)
        header = self._recvall(7)
        tid, _proto, length, unit = struct.unpack(">HHHB", header)
        resp = self._recvall(length - 1)
        self.last_request = time.monotonic()
        if unit != self.unit:
            raise ConnectionError(f"Antwort von falscher Slave-Adresse {unit}")
        if resp[0] & 0x80:
            raise ModbusError(resp[0] & 0x7F, resp[1])
        return resp

    def read(self, address, count):
        """FC04 (Input-Register) - Sigenergy liest ALLE Register so."""
        resp = self._request(struct.pack(">BHH", 4, address, count))
        return list(struct.unpack(f">{count}H", resp[2:2 + count * 2]))

    def write_u16(self, address, value):
        self._request(struct.pack(">BHH", 6, address, value & 0xFFFF))
        log(f"  WRITE {address} = {value} (FC06)")

    def write_u32(self, address, value):
        hi, lo = (value >> 16) & 0xFFFF, value & 0xFFFF
        self._request(struct.pack(">BHHBHH", 16, address, 2, 4, hi, lo))
        log(f"  WRITE {address} = {value} (FC16, U32)")


class ModbusError(Exception):
    CODES = {1: "Illegal function", 2: "Illegal data address",
             3: "Illegal data value", 4: "Slave device failure"}

    def __init__(self, fc, code):
        self.fc, self.code = fc, code
        name = self.CODES.get(code, f"Code {code}")
        super().__init__(f"Modbus-Exception auf FC{fc}: {name}")


def u32_be(words):
    return (words[0] << 16) | words[1]


def u32_wswap(words):
    return (words[1] << 16) | words[0]


def s32_be(words):
    v = u32_be(words)
    return v - 0x100000000 if v >= 0x80000000 else v


def show_u32(label, words, unit="W", plaus=(100, 1000000)):
    """Zeigt beide Wortreihenfolgen und markiert die plausible (Punkt 3)."""
    be, sw = u32_be(words), u32_wswap(words)
    be_ok = plaus[0] <= be <= plaus[1]
    sw_ok = plaus[0] <= sw <= plaus[1]
    verdict = ""
    if be_ok and not sw_ok:
        verdict = "-> Big Endian (wie erwartet)"
    elif sw_ok and not be_ok:
        verdict = "-> WORT-SWAP! Thing-Manifest auf _swap-Typen umstellen!"
    elif be == sw:
        verdict = "(beide Reihenfolgen identisch - kein Befund)"
    else:
        verdict = "-> UNKLAR, von Hand pruefen"
    log(f"  {label}: raw={words[0]:#06x},{words[1]:#06x}  "
        f"BE={be} {unit}  Swap={sw} {unit}  {verdict}")
    return be


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


# --- Schritte ---------------------------------------------------------------

def step_reads(dev, args):
    log("== READS: Punkt 2/3/7 - Register lesen und dekodieren ==")
    mode = dev.read(REG_EMS_MODE, 1)[0]
    log(f"  EMS work mode (30003): {mode}"
        + (" = Remote EMS" if mode == EMS_WORK_MODE_REMOTE else ""))
    if mode > 10:
        log("  !! Unplausibel - falsches Geraet oder falsche Registerkarte?")

    maxw = show_u32("Max active power (30010)", dev.read(REG_MAX_ACTIVE, 2))
    soc_raw = dev.read(REG_SOC, 1)[0]
    log(f"  Plant ESS SoC (30014): raw={soc_raw} -> {soc_raw / 10:.1f} % "
        f"(mit App-Anzeige vergleichen! Gain-Erwartung: 10)")
    ess = dev.read(REG_ESS_POWER, 2)
    log(f"  ESS power (30037): {s32_be(ess)} W "
        f"(Protokoll: > 0 = laden, < 0 = entladen - gegen App pruefen)")
    show_u32("Rated ESS charging power (30068)", dev.read(REG_RATED_CHARGE, 2))
    rated = show_u32("Rated ESS discharging power (30070)",
                     dev.read(REG_RATED_DISCHARGE, 2))

    log("  -- Steuerregister (Punkt 7: PV-Limit-Defaultwert!) --")
    ctrl = dev.read(REG_RMT_ENABLE, 9)  # 40029..40037
    log(f"  Remote EMS enable (40029): {ctrl[0]}")
    log(f"  Remote EMS mode   (40031): {ctrl[2]} "
        f"({MODE_NAMES.get(ctrl[2], '?')})")
    log(f"  ESS max charging limit  (40032): {u32_be(ctrl[3:5])} W")
    log(f"  ESS max discharging limit (40034): {u32_be(ctrl[5:7])} W")
    pv_default = u32_be(ctrl[7:9])
    log(f"  PV max power limit (40036): {pv_default} W  "
        f"<- DEFAULTWERT fuer Punkt 7 notieren!")
    if pv_default < maxw:
        log(f"  !! PV-Limit ({pv_default} W) liegt unter dem Anlagenmaximum "
            f"({maxw} W) - im Kommando-Modus wuerde es die PV begrenzen. "
            f"Der Adapter gibt es vor jedem Befehl frei; hier nur notieren.")
    log(f"  Plausibilitaet: Nennentladeleistung {rated} W "
        + ("OK" if 100 <= rated <= 1000000 else "UNPLAUSIBEL"))
    log("")


def step_watch(dev, args):
    log("== WATCH: SoC / ESS-Leistung alle 10 s (Ctrl+C beendet) ==")
    try:
        while True:
            soc = dev.read(REG_SOC, 1)[0]
            ess = s32_be(dev.read(REG_ESS_POWER, 2))
            mode = dev.read(REG_EMS_MODE, 1)[0]
            log(f"  SoC {soc / 10:.1f} %  ESS {ess:+d} W  EMS-Modus {mode}")
            time.sleep(10)
    except KeyboardInterrupt:
        log("  Watch beendet.")


def step_toggle(dev, args):
    log("== TOGGLE: Punkt 4 - Remote EMS ein/aus, EMS-Modus beobachten ==")
    if not confirm(args, "Remote EMS kurz aktivieren (keine Leistungsaenderung)?"):
        return
    dev.write_u16(REG_RMT_ENABLE, 1)
    time.sleep(2)
    mode = dev.read(REG_EMS_MODE, 1)[0]
    log(f"  EMS work mode nach Enable: {mode} "
        + ("OK (= 7, Remote EMS)" if mode == EMS_WORK_MODE_REMOTE
           else "!! erwartet war 7"))
    dev.write_u16(REG_RMT_ENABLE, 0)
    time.sleep(2)
    mode = dev.read(REG_EMS_MODE, 1)[0]
    log(f"  EMS work mode nach Disable: {mode} "
        + ("!! haengt noch auf 7" if mode == EMS_WORK_MODE_REMOTE else "OK"))
    log("")


def _command(dev, mode, discharge_limit_w):
    """Kommando-Sequenz wie im Adapter: PV-Limit frei, Limit, Modus, Enable."""
    maxw = u32_be(dev.read(REG_MAX_ACTIVE, 2))
    if maxw < 1000:
        maxw = 100000
    dev.write_u32(REG_PV_LIMIT, maxw)
    dev.write_u32(REG_DIS_LIMIT, discharge_limit_w)
    dev.write_u16(REG_RMT_MODE, mode)
    dev.write_u16(REG_RMT_ENABLE, 1)


def _observe(dev, seconds=60):
    """ESS-Leistung/SoC waehrend eines Kommandos mitlesen."""
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        ess = s32_be(dev.read(REG_ESS_POWER, 2))
        soc = dev.read(REG_SOC, 1)[0]
        mode = dev.read(REG_EMS_MODE, 1)[0]
        log(f"  ESS {ess:+d} W  SoC {soc / 10:.1f} %  EMS-Modus {mode}")
        time.sleep(10)


def step_prevent(dev, args):
    log("== PREVENT: Punkt 6 - Ladesperre (Modus 5 + Entladelimit 0) ==")
    log("  Pruefen waehrend der Sperre: Batterie laedt NICHT (auch bei")
    log("  PV-Ueberschuss), entlaedt nicht, PV laeuft normal weiter.")
    if not confirm(args, "Ladesperre jetzt kommandieren?"):
        return
    _command(dev, mode=5, discharge_limit_w=0)
    _observe(dev, seconds=30 if args.yes else 120)
    wait_enter(args, "Verhalten in der App/am Zaehler pruefen")
    step_reset(dev, args)


def step_discharge(dev, args):
    watts = args.watts
    log(f"== DISCHARGE: Punkt 8 - forcierte Entladung mit {watts} W ==")
    rated = u32_be(dev.read(REG_RATED_DISCHARGE, 2))
    if watts > rated:
        log(f"  Hinweis: {watts} W > Nennentladeleistung {rated} W - "
            f"Verhalten dokumentieren (Fehler oder stilles Klemmen).")
    if not confirm(args, f"Entladung mit {watts} W jetzt kommandieren?"):
        return
    _command(dev, mode=6, discharge_limit_w=watts)
    _observe(dev, seconds=30 if args.yes else 120)
    log("  Erwartung: ESS power ~ -" + str(watts)
        + " W (Registerwert = W, gegen App/Zaehler messen)")
    wait_enter(args, "AC-Leistung gegen App/Zaehler vergleichen")
    step_reset(dev, args)


def step_failsafe(dev, args):
    log("== FAILSAFE: Punkt 9 - Go/No-Go: Auto-Revert bei Master-Verlust ==")
    log("  ACHTUNG: Dieses Skript kommandiert eine Entladung und beendet")
    log("  sich OHNE Reset. Danach: Verbindung getrennt lassen und in der")
    log("  App beobachten, ob die Anlage nach einem Timeout von selbst in")
    log("  den Normalbetrieb zurueckkehrt. Ergebnis in README-Tabelle und")
    log("  SIGEN_HAS_AUTO_REVERT (adapter.js) eintragen.")
    log("  Aufraeumen danach IMMER mit:  spike_sigenstor.py <ip> reset")
    if not confirm(args, f"Entladung ({args.watts} W) stehen lassen?"):
        return
    _command(dev, mode=6, discharge_limit_w=args.watts)
    log("  Kommando steht. Skript beendet sich jetzt OHNE Reset.")
    dev.close()
    sys.exit(0)


def step_reset(dev, args):
    log("== RESET: Remote EMS aus (40029 = 0) - Werksverhalten ==")
    dev.write_u16(REG_RMT_ENABLE, 0)
    time.sleep(2)
    mode = dev.read(REG_EMS_MODE, 1)[0]
    log(f"  EMS work mode: {mode} "
        + ("!! noch Remote EMS" if mode == EMS_WORK_MODE_REMOTE else "OK"))
    log("")


STEPS = {
    "reads": step_reads,
    "watch": step_watch,
    "toggle": step_toggle,
    "prevent": step_prevent,
    "discharge": step_discharge,
    "failsafe": step_failsafe,
    "reset": step_reset,
}


def main():
    global LOG_FILE
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("host", help="IP der SigenStor-Anlage")
    parser.add_argument("steps", nargs="*", default=["reads"],
                        choices=list(STEPS), help="Schritte (Vorgabe: reads)")
    parser.add_argument("--port", type=int, default=502)
    parser.add_argument("--unit", type=int, default=247,
                        help="Slave-Adresse (Vorgabe 247 = Anlagenebene)")
    parser.add_argument("--watts", type=int, default=1000,
                        help="Entladeleistung fuer discharge/failsafe (W)")
    parser.add_argument("--yes", action="store_true",
                        help="Bestaetigungen ueberspringen (Simulator-Tests)")
    parser.add_argument("--log", default="spike_sigenstor.log",
                        help="Logdatei (Vorgabe: spike_sigenstor.log)")
    args = parser.parse_args()
    if not args.steps:
        args.steps = ["reads"]

    LOG_FILE = open(args.log, "a")
    log(f"=== Spike {args.host}:{args.port} Slave {args.unit} "
        f"Schritte: {', '.join(args.steps)} ===")

    dev = SigenStor(args.host, args.port, args.unit)
    controlled = False
    try:
        dev.connect()
        log(f"Verbunden mit {args.host}:{args.port}.")
        for name in args.steps:
            if name in ("toggle", "prevent", "discharge", "failsafe"):
                controlled = True
            STEPS[name](dev, args)
        log("Fertig. Befunde in die Registertabelle im README eintragen.")
    except KeyboardInterrupt:
        log("Abbruch (Ctrl+C).")
        if controlled:
            log("Sicherheits-Reset ...")
            try:
                dev.write_u16(REG_RMT_ENABLE, 0)
            except Exception as e:
                log(f"!! Reset fehlgeschlagen: {e} - von Hand: Schritt reset")
        sys.exit(1)
    except (OSError, ModbusError, ConnectionError) as e:
        log(f"FEHLER: {e}")
        if controlled:
            log("Sicherheits-Reset ...")
            try:
                dev.write_u16(REG_RMT_ENABLE, 0)
            except Exception as e2:
                log(f"!! Reset fehlgeschlagen: {e2} - von Hand: Schritt reset")
        sys.exit(1)
    finally:
        dev.close()


if __name__ == "__main__":
    main()
