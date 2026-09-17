#!/usr/bin/env python3
"""Fail-Safe-Reset fuer den Fronius Datamanager (SunSpec Model 124), ohne openHAB.

Schreibt das Werksverhalten des Storage-Models - InWRte 100 %, OutWRte 100 %,
StorCtl_Mod 0, dieselben drei Writes wie ibmReset() in adapter.js - und
prueft per Read-back, dass die Register wirklich stehen (auf diesem Geraet
beweist ein angenommener Write allein nichts, siehe README, Spike-Punkt 7).

Aufgerufen vom root-Timer ibm-failsafe (setup/10-install-failsafe.sh), wenn
openHAB keinen Heartbeat mehr schreibt oder nicht laeuft, und vom
Boot-Reset. Nur Standardbibliothek; der Modbus-Client entspricht dem in
spike_datamanager.py (am Geraet erprobt 2026-09-10), bewusst ohne Import
daraus, damit der Produktionspfad nicht an einem Diagnosewerkzeug haengt.

    failsafe_reset.py --host 192.168.1.50 [--port 502] [--unit 1] [--base 40303]

Wie der Adapter schreibt das Skript nur, wenn an der Basisadresse die
Model-ID 124 steht - ein Nicht-Hybrid oder eine Float-Registerkarte wird
nie beschrieben.

Exit 0  Reset geschrieben und per Read-back bestaetigt
Exit 1  Geraet nicht erreichbar oder Modbus-Fehler
Exit 2  kein Model 124 an der Basisadresse (nichts geschrieben)
Exit 3  Writes angenommen, Read-back weicht ab
"""

import argparse
import socket
import struct
import sys
import time

# Offsets im Model 124 (0-basiert ab der ID), Registerkarte Blatt IC124
OFF_ID = 0
OFF_STORCTL = 5
OFF_OUTWRTE = 12
OFF_INWRTE = 13
M124_LEN = 26

# Werksverhalten: 100 % bei InOutWRte_SF = -2, keine aktive Steuerung
RESET_WRTE_RAW = 10000
RESET_STORCTL = 0

# Anleitung S. 15: bei mehreren Geraeten im Ring >= 10 s Timeout, sequenziell
MODBUS_TIMEOUT_S = 10.0
REQUEST_PAUSE_S = 0.5


class ModbusError(Exception):
    CODES = {1: "Illegal function", 2: "Illegal data address",
             3: "Illegal data value", 4: "Slave device failure",
             10: "Gateway path unavailable", 11: "Gateway target failed"}

    def __init__(self, fc, code):
        name = self.CODES.get(code, f"Code {code}")
        super().__init__(f"Modbus-Exception auf FC{fc}: {name} (0x{code:02X})")


class Client:
    """Minimaler Modbus-TCP-Client: FC03 lesen, FC06 schreiben."""

    def __init__(self, host, port, unit):
        self.host, self.port, self.unit = host, port, unit
        self.sock = None
        self.tid = 0
        self.last_request = 0.0

    def connect(self):
        self.sock = socket.create_connection((self.host, self.port), timeout=MODBUS_TIMEOUT_S)
        self.sock.settimeout(MODBUS_TIMEOUT_S)

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
        self.sock.sendall(struct.pack(">HHHB", self.tid, 0, len(pdu) + 1, self.unit) + pdu)
        header = self._recvall(7)
        _tid, _proto, length, _unit = struct.unpack(">HHHB", header)
        resp = self._recvall(length - 1)
        self.last_request = time.monotonic()
        if resp[0] & 0x80:
            raise ModbusError(resp[0] & 0x7F, resp[1])
        return resp

    def read(self, address, count):
        resp = self._request(struct.pack(">BHH", 3, address, count))
        return list(struct.unpack(f">{count}H", resp[2:2 + count * 2]))

    def write(self, address, value):
        self._request(struct.pack(">BHH", 6, address, value & 0xFFFF))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", required=True, help="IP des Datamanagers")
    parser.add_argument("--port", type=int, default=502)
    parser.add_argument("--unit", type=int, default=1,
                        help="Unit-ID = Wechselrichter-Nummer des Hybrid (Vorgabe 1)")
    parser.add_argument("--base", type=int, default=40303,
                        help="Basisadresse von Model 124 (int+SF: 40303)")
    args = parser.parse_args()

    dev = Client(args.host, args.port, args.unit)
    try:
        before = dev.read(args.base, M124_LEN)
        if before[OFF_ID] != 124:
            print(f"kein Model 124 an {args.base} (gelesen: {before[OFF_ID]}) - nichts geschrieben")
            return 2

        # Reihenfolge wie im Adapter: erst die Limits, dann das Bitfeld.
        dev.write(args.base + OFF_INWRTE, RESET_WRTE_RAW)
        dev.write(args.base + OFF_OUTWRTE, RESET_WRTE_RAW)
        dev.write(args.base + OFF_STORCTL, RESET_STORCTL)

        after = dev.read(args.base, M124_LEN)
    except (OSError, ModbusError, ConnectionError) as e:
        print(f"{args.host}:{args.port} Unit {args.unit}: {e}")
        return 1
    finally:
        dev.close()

    ok = (after[OFF_INWRTE] == RESET_WRTE_RAW
          and after[OFF_OUTWRTE] == RESET_WRTE_RAW
          and after[OFF_STORCTL] == RESET_STORCTL)
    print(f"vorher StorCtl {before[OFF_STORCTL]} InWRte {before[OFF_INWRTE]} OutWRte {before[OFF_OUTWRTE]}"
          f" -> nachher StorCtl {after[OFF_STORCTL]} InWRte {after[OFF_INWRTE]} OutWRte {after[OFF_OUTWRTE]}"
          f" ({'bestaetigt' if ok else 'ABWEICHUNG'})")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
