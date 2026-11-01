#!/usr/bin/env python3
"""Fail-Safe-Reset fuer Victron-GX-Anlagen (ESS-Settings-Register), ohne openHAB.

Schreibt das Werksverhalten der Anlage wie ibmReset() in adapter.js:
DVCC MaxChargeCurrent (2705) = gemerkter Werkswert (Vorgabe -1 = unbegrenzt)
und ESS grid setpoint (2700) = gemerkter Werkswert (Vorgabe 50 W, Victron-
Vorgabe) - und prueft per Read-back, dass beide Register stehen. Die Anlage
folgt danach wieder ihrer normalen ESS-Regelung (Eigenverbrauch).

Hintergrund: Victron kennt fuer die Settings-Register KEIN geraeteseitiges
Auto-Revert - ein kommandierter Setpoint bleibt stehen, wenn openHAB
ausfaellt (Spike pi-031 2026-10-21: -600 W standen 150 s ohne Modbus-Master,
der Export lief weiter). Darum ruft der root-Timer ibm-failsafe
(setup/10-install-failsafe.sh) dieses Skript auf, wenn openHAB keinen
Heartbeat mehr schreibt oder nicht laeuft, und der Boot-Reset vor dem
openHAB-Start. Nur Standardbibliothek; der Modbus-Client entspricht dem in
spike_venus.py (am Geraet erprobt 2026-10-21), bewusst ohne Import daraus,
damit der Produktionspfad nicht an einem Diagnosewerkzeug haengt.

    failsafe_reset.py --host 192.168.1.2 [--port 502] [--unit 100]
                      [--setpoint 50] [--max-charge -1]
                      [--scan] [--serial-file /pfad/serial] [--scan-base 192.168.1]

--scan: antwortet die Adresse nicht (keine Verbindung), werden alle direkt
angeschlossenen IPv4-Netze des Pi (je ein /24, ohne Tunnel) nach dem
GX-Geraet abgesucht (FC03 auf die Seriennummer 800, Unit 100 - dieselbe
Probe wie rediscover.sh). Geschrieben wird nur, wenn GENAU EIN Geraet
antwortet - oder, mit --serial-file (vom Netzwerk-Watchdog gemerkte
Seriennummer), das Geraet mit dieser Seriennummer. --scan-base ersetzt die
Netzermittlung (Tests, macOS ohne `ip`).

Sicherung gegen das falsche Geraet / die falsche Registerkarte (wie
__ibmVicGuard() im Adapter): geschrieben wird nur, wenn die Seriennummer
(800) lesbar ist, der ESS-Modus (2902) 1 oder 2 ist und der Ladestand (843)
plausibel ist. Modus 3 (Externe Steuerung) heisst: ein anderes EMS
steuert, unsere Register sind wirkungslos - nichts schreiben, Exit 2.
Reads laufen - wie das ganze Profil - ueber FC03, Writes ueber FC06,
literal adressiert, Systemebene Unit 100.

Exit 0  Reset geschrieben und per Read-back bestaetigt (2700/2705 stehen)
Exit 1  Geraet nicht erreichbar oder Modbus-Fehler (mit --scan: auch kein
        oder kein eindeutiges GX im Netz gefunden)
Exit 2  antwortet nicht wie ein Victron-GX im ESS-Betrieb (Guard) - nichts
        geschrieben
Exit 3  Write angenommen, Read-back weicht ab
"""

import argparse
import concurrent.futures
import socket
import struct
import subprocess
import sys
import time

# Registerkarte (Systemebene, Unit 100) - muss profile.sh / adapter.js
# entsprechen. Literal adressiert, Halteregister.
REG_SERIAL = 800         # String[6], 12 ASCII-Zeichen
REG_SOC = 843            # U16, %
REG_SETPOINT = 2700      # S16, W (+ Netzbezug, - Einspeisung)
REG_MAX_CHARGE_A = 2705  # S16, A; -1 = unbegrenzt, 0 = Ladesperre
REG_ESS_MODE = 2902      # U16, 1/2 = ESS, 3 = Externe Steuerung

# Rueckfallwerte wie VIC_DEFAULT_GRID_SETPOINT_W / VIC_DEFAULT_MAX_CHARGE_A
DEFAULT_SETPOINT_W = 50
DEFAULT_MAX_CHARGE_A = -1

REQUEST_PAUSE_S = 0.2
MODBUS_TIMEOUT_S = 5.0


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
        self._request(struct.pack(">BHH", 6, address, value & 0xFFFF))


def s16(v):
    return v - 0x10000 if v >= 0x8000 else v


def decode_serial(words):
    raw = b"".join(struct.pack(">H", w) for w in words)
    return raw.decode("ascii", errors="replace").strip("\x00 ")


def serial_plausible(serial):
    return len(serial) >= 8 and serial.isalnum()


# Schnittstellen, die nie zum Netz des Wechselrichters fuehren (wie in
# rediscover.sh): Tunnel und Container-Bruecken.
SKIP_DEV_PREFIXES = ("wg", "tun", "tailscale", "docker", "veth", "br-")


def local_bases():
    """Alle direkt angeschlossenen IPv4-Netze des Pi als /24-Basis
    ("192.168.1"), ohne Tunnel und ohne Host-Adressen (/29 und kleiner)."""
    try:
        out = subprocess.run(["ip", "-4", "-o", "addr", "show", "scope", "global"],
                             capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    bases = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 4 or "/" not in parts[3]:
            continue
        dev, cidr = parts[1], parts[3]
        if dev.startswith(SKIP_DEV_PREFIXES):
            continue
        addr, _, prefix = cidr.partition("/")
        if not prefix.isdigit() or int(prefix) > 28:
            continue
        base = addr.rsplit(".", 1)[0]
        if base not in bases:
            bases.append(base)
    return bases


def probe(ip, port, unit):
    """Antwortet unter ip ein GX? FC03 auf 800 (6 Register), Unit unit.
    Liefert die Seriennummer oder None."""
    try:
        s = socket.create_connection((ip, port), timeout=1)
        s.settimeout(1.5)
        s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
                  + struct.pack(">BHH", 3, REG_SERIAL, 6))
        resp = s.recv(256)
        s.close()
        if len(resp) >= 21 and resp[6] == unit and resp[7] == 3:
            serial = decode_serial(struct.unpack(">6H", resp[9:21]))
            return serial if serial_plausible(serial) else None
        return None
    except OSError:
        return None


def scan(port, unit, bases):
    """Alle /24-Netze absuchen; Liste (ip, seriennummer) der Treffer."""
    ips = [f"{b}.{i}" for b in bases for i in range(1, 255)]
    found = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
        for ip, serial in zip(ips, pool.map(lambda ip: probe(ip, port, unit), ips)):
            if serial:
                found.append((ip, serial))
    return found


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", required=True, help="IP des GX-Geraets")
    parser.add_argument("--port", type=int, default=502)
    parser.add_argument("--unit", type=int, default=100,
                        help="Systemebene = Unit-ID (Vorgabe 100)")
    parser.add_argument("--setpoint", type=int, default=DEFAULT_SETPOINT_W,
                        help=f"Werkswert ESS grid setpoint in W (Vorgabe {DEFAULT_SETPOINT_W})")
    parser.add_argument("--max-charge", type=int, default=DEFAULT_MAX_CHARGE_A,
                        help=f"Werkswert DVCC MaxChargeCurrent in A (Vorgabe {DEFAULT_MAX_CHARGE_A} = unbegrenzt)")
    parser.add_argument("--scan", action="store_true",
                        help="bei unerreichbarer Adresse das Netz nach dem GX absuchen")
    parser.add_argument("--serial-file", default="",
                        help="Datei mit der vom Watchdog gemerkten Seriennummer (fuer --scan)")
    parser.add_argument("--scan-base", action="append", default=[],
                        help="/24-Basis fuer --scan statt der lokalen Netze, z. B. 192.168.1")
    args = parser.parse_args()
    if not -32768 <= args.setpoint <= 32767 or not -32768 <= args.max_charge <= 32767:
        print("Werkswerte muessen in ein int16-Register passen - nichts geschrieben")
        return 2

    host = args.host
    dev = VenusGX(host, args.port, args.unit)
    try:
        # --- Erreichbarkeit; mit --scan ersatzweise das Geraet suchen -------
        try:
            dev.connect()
        except OSError as e:
            if not args.scan:
                raise
            remembered = ""
            if args.serial_file:
                try:
                    with open(args.serial_file) as f:
                        remembered = f.read().strip()
                except OSError:
                    remembered = ""
            bases = args.scan_base or local_bases()
            found = scan(args.port, args.unit, bases)
            nets = " ".join(f"{b}.0/24" for b in bases) or "-"
            if remembered:
                found = [(ip, sn) for ip, sn in found if sn == remembered]
            if len(found) != 1:
                hits = ", ".join(f"{ip} ({sn})" for ip, sn in found)
                print(f"{host}:{args.port}: {e}; Netzsuche in {nets}"
                      f"{' nach Seriennummer ' + remembered if remembered else ''}: "
                      f"{len(found)} GX gefunden{' (' + hits + ')' if hits else ''} - "
                      f"nichts geschrieben")
                return 1
            host = found[0][0]
            print(f"{args.host}:{args.port} antwortet nicht ({e}) - GX "
                  f"{found[0][1]} per Netzsuche unter {host} gefunden")
            dev.close()
            dev = VenusGX(host, args.port, args.unit)

        # --- Guard: antwortet das wirklich wie ein Victron-GX im ESS? -------
        serial = decode_serial(dev.read(REG_SERIAL, 6))
        if not serial_plausible(serial):
            print(f"Seriennummer unplausibel ('{serial}') - kein GX an "
                  f"{host}:{args.port}/{args.unit}, nichts geschrieben")
            return 2
        mode = dev.read(REG_ESS_MODE, 1)[0]
        if mode not in (1, 2):
            print(f"ESS-Modus {mode} (erwartet 1/2; 3 = Externe Steuerung) - "
                  f"Settings-Register wirkungslos, nichts geschrieben")
            return 2
        soc = dev.read(REG_SOC, 1)[0]
        if soc > 100:
            print(f"Ladestand unplausibel ({soc}) - falsche Registerkarte?, "
                  f"nichts geschrieben")
            return 2
        sp_before = dev.read_s16(REG_SETPOINT)
        mc_before = dev.read_s16(REG_MAX_CHARGE_A)

        # --- Reset: Ladestrom frei, Setpoint auf Werkswert (wie ibmReset) ---
        dev.write_s16(REG_MAX_CHARGE_A, args.max_charge)
        dev.write_s16(REG_SETPOINT, args.setpoint)
        time.sleep(1)

        # --- Read-back ----------------------------------------------------
        sp_after = dev.read_s16(REG_SETPOINT)
        mc_after = dev.read_s16(REG_MAX_CHARGE_A)
    except (OSError, ModbusError, ConnectionError) as e:
        print(f"{host}:{args.port} Unit {args.unit}: {e}")
        return 1
    finally:
        dev.close()

    ok = sp_after == args.setpoint and mc_after == args.max_charge
    print(f"GX {serial}: vorher setpoint {sp_before} W, MaxChargeCurrent {mc_before} A -> "
          f"setpoint {args.setpoint} W, MaxChargeCurrent {args.max_charge} A geschrieben -> "
          f"nachher {sp_after} W / {mc_after} A ({'bestaetigt' if ok else 'ABWEICHUNG'})")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
