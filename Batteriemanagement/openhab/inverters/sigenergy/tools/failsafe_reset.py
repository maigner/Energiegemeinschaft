#!/usr/bin/env python3
"""Fail-Safe-Reset fuer die Sigenergy SigenStor (Remote EMS), ohne openHAB.

Schreibt das Werksverhalten der Anlage wie ibmReset() in adapter.js:
Entladelimit (40034) = Nennentladeleistung, Remote-EMS-Modus (40031) = 2
(Maximum self-consumption), Remote EMS enable (40029) = 0 - und prueft per
Read-back, dass Enable und Limit stehen und der EMS-Modus nicht mehr auf 7
(Remote EMS) haengt. Limit und Modus gehoeren dazu, weil das Entladelimit
auch bei enable = 0 als Deckel wirkt (223, 2026-10-04: Limit 0 aus der
Ladesperre, volle Batterie stand den Abend still, Haus bezog aus dem Netz).

Hintergrund: Sigenergy kennt (Stand Protokoll V1.7) KEIN geraeteseitiges
Auto-Revert - ein kommandierter Remote-EMS-Zustand bleibt stehen, wenn
openHAB ausfaellt. Darum ruft der root-Timer ibm-failsafe
(setup/10-install-failsafe.sh) dieses Skript auf, wenn openHAB keinen
Heartbeat mehr schreibt oder nicht laeuft, und der Boot-Reset vor dem
openHAB-Start. Nur Standardbibliothek; der Modbus-Client entspricht dem in
spike_sigenstor.py (am Geraet erprobt 2026-10-02), bewusst ohne Import
daraus, damit der Produktionspfad nicht an einem Diagnosewerkzeug haengt.

    failsafe_reset.py --host 192.168.1.107 [--port 502] [--unit 247] [--scan]

--scan: antwortet die Adresse nicht (keine Verbindung), werden alle direkt
angeschlossenen IPv4-Netze des Pi (je ein /24, ohne Tunnel) nach GENAU
EINER SigenStor abgesucht (FC04 auf 30003, Slave 247 - dieselbe Probe wie
rediscover.sh) und der Reset dorthin geschrieben. Hintergrund pi-223
2026-10-03: DHCP verschob die Anlage von .107 auf .101, waehrend openHAB
weg war, waere der Timer 3,5 h ins Leere gelaufen. Die Bridge in openHAB
korrigiert spaeter der Netzwerk-Watchdog; der Timer meldet die gefundene
Adresse im Log.

Sicherung gegen das falsche Geraet / die falsche Registerkarte (wie
__ibmSgGuard() im Adapter): geschrieben wird nur, wenn der EMS-Modus
(30003) lesbar und plausibel ist UND die Nennentladeleistung (30070) im
plausiblen Fenster liegt. Reads laufen - wie das ganze Profil - ueber FC04,
Writes ueber FC06, literal adressiert, Anlagenebene Slave 247.

Exit 0  Reset geschrieben und per Read-back bestaetigt (40029 == 0)
Exit 1  Geraet nicht erreichbar oder Modbus-Fehler (mit --scan: auch keine
        oder mehrere SigenStor im Netz gefunden)
Exit 2  antwortet nicht wie eine SigenStor (Guard) - nichts geschrieben
Exit 3  Write angenommen, Read-back weicht ab (40029 != 0 oder 40034 != Nennleistung)
"""

import argparse
import concurrent.futures
import socket
import struct
import subprocess
import sys
import time

# Registerkarte (Anlagenebene, Slave 247) - muss profile.sh / adapter.js
# entsprechen. Literal adressiert.
REG_EMS_MODE = 30003         # U16, 7 = Remote EMS aktiv
REG_RATED_DISCHARGE = 30070  # U32, W
REG_RMT_ENABLE = 40029       # U16, 0/1
REG_RMT_MODE = 40031         # U16, Appendix 6; 2 = Maximum self-consumption
REG_DISCHARGE_LIMIT = 40034  # U32, W - wirkt auch bei enable = 0 als Deckel
MODE_SELF_CONSUMPTION = 2

EMS_WORK_MODE_REMOTE = 7

# Plausibilitaetsfenster fuer die Nennentladeleistung in Watt (wie der
# Adapter: SIGEN_RATED_MIN_W / SIGEN_RATED_MAX_W)
RATED_MIN_W = 100
RATED_MAX_W = 1000000

# Protokoll 4.2: Minimum request period 1000 ms
REQUEST_PAUSE_S = 1.0
MODBUS_TIMEOUT_S = 5.0


class ModbusError(Exception):
    CODES = {1: "Illegal function", 2: "Illegal data address",
             3: "Illegal data value", 4: "Slave device failure"}

    def __init__(self, fc, code):
        self.fc, self.code = fc, code
        name = self.CODES.get(code, f"Code {code}")
        super().__init__(f"Modbus-Exception auf FC{fc}: {name}")


class SigenStor:
    """Minimaler Modbus-TCP-Client (FC04 lesen, FC06 schreiben)."""

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
        _tid, _proto, length, unit = struct.unpack(">HHHB", header)
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

    def write_u32(self, address, value):
        """FC16, zwei Register, Big Endian (wie das Binding mit int32)."""
        self._request(struct.pack(">BHHB", 16, address, 2, 4)
                      + struct.pack(">HH", (value >> 16) & 0xFFFF, value & 0xFFFF))


def u32_be(words):
    return (words[0] << 16) | words[1]


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
    """Antwortet unter ip eine SigenStor? FC04 auf 30003, Slave unit."""
    try:
        s = socket.create_connection((ip, port), timeout=1)
        s.settimeout(1.5)
        s.sendall(struct.pack(">HHHB", 1, 0, 6, unit)
                  + struct.pack(">BHH", 4, REG_EMS_MODE, 1))
        resp = s.recv(256)
        s.close()
        return len(resp) >= 9 and resp[6] == unit and resp[7] == 4
    except OSError:
        return False


def scan(port, unit):
    """Alle lokalen /24-Netze absuchen; Liste der antwortenden Adressen."""
    bases = local_bases()
    ips = [f"{b}.{i}" for b in bases for i in range(1, 255)]
    found = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
        for ip, ok in zip(ips, pool.map(lambda ip: probe(ip, port, unit), ips)):
            if ok:
                found.append(ip)
    return bases, found


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", required=True, help="IP der Anlage")
    parser.add_argument("--port", type=int, default=502)
    parser.add_argument("--unit", type=int, default=247,
                        help="Anlagenebene = Slave-Adresse (Vorgabe 247)")
    parser.add_argument("--scan", action="store_true",
                        help="bei unerreichbarer Adresse das Netz nach der "
                             "Anlage absuchen (genau ein Treffer noetig)")
    args = parser.parse_args()

    host = args.host
    dev = SigenStor(host, args.port, args.unit)
    try:
        # --- Erreichbarkeit; mit --scan ersatzweise die Anlage suchen -------
        try:
            dev.connect()
        except OSError as e:
            if not args.scan:
                raise
            bases, found = scan(args.port, args.unit)
            nets = " ".join(f"{b}.0/24" for b in bases) or "-"
            if len(found) != 1:
                print(f"{host}:{args.port}: {e}; Netzsuche in {nets}: "
                      f"{len(found)} SigenStor gefunden"
                      f"{' (' + ', '.join(found) + ')' if found else ''} - "
                      f"nichts geschrieben")
                return 1
            host = found[0]
            print(f"{args.host}:{args.port} antwortet nicht ({e}) - Anlage per "
                  f"Netzsuche unter {host} gefunden")
            dev.close()
            dev = SigenStor(host, args.port, args.unit)

        # --- Guard: antwortet das wirklich wie eine SigenStor? --------------
        mode_before = dev.read(REG_EMS_MODE, 1)[0]
        if mode_before < 0 or mode_before > 10:
            print(f"EMS-Modus unplausibel (gelesen: {mode_before}) - "
                  f"keine SigenStor an {host}:{args.port}/{args.unit}, "
                  f"nichts geschrieben")
            return 2
        rated = u32_be(dev.read(REG_RATED_DISCHARGE, 2))
        if rated < RATED_MIN_W or rated > RATED_MAX_W:
            print(f"Nennentladeleistung unplausibel ({rated} W) - "
                  f"nichts geschrieben")
            return 2

        # --- Reset: Limit und Modus neutral, dann Enable aus (wie ibmReset) -
        dev.write_u32(REG_DISCHARGE_LIMIT, rated)
        dev.write_u16(REG_RMT_MODE, MODE_SELF_CONSUMPTION)
        dev.write_u16(REG_RMT_ENABLE, 0)

        # Der EMS-Modus folgt dem Enable nicht sofort - dem Geraet kurz Zeit
        # geben, bevor der Read-back prueft (Spike-Reset: 2 s, dann Modus 0).
        time.sleep(2)

        # --- Read-back: FC04, Register muessen stehen -----------------------
        enable_after = dev.read(REG_RMT_ENABLE, 1)[0]
        limit_after = u32_be(dev.read(REG_DISCHARGE_LIMIT, 2))
        mode_after = dev.read(REG_EMS_MODE, 1)[0]
    except (OSError, ModbusError, ConnectionError) as e:
        print(f"{host}:{args.port} Slave {args.unit}: {e}")
        return 1
    finally:
        dev.close()

    ok = (enable_after == 0 and limit_after == rated
          and mode_after != EMS_WORK_MODE_REMOTE)
    print(f"vorher EMS-Modus {mode_before} -> Limit {rated} W, Modus "
          f"{MODE_SELF_CONSUMPTION}, Remote EMS enable 0 geschrieben -> nachher "
          f"enable {enable_after}, Limit {limit_after} W, EMS-Modus {mode_after} "
          f"({'bestaetigt' if ok else 'ABWEICHUNG'})")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
