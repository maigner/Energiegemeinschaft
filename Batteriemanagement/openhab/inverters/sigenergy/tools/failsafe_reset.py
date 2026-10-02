#!/usr/bin/env python3
"""Fail-Safe-Reset fuer die Sigenergy SigenStor (Remote EMS), ohne openHAB.

Schreibt das Werksverhalten der Anlage - Remote EMS enable (40029) = 0,
genau der eine Write aus ibmReset() in adapter.js - und prueft per
Read-back, dass das Register wirklich steht und der EMS-Modus nicht mehr
auf 7 (Remote EMS) haengt.

Hintergrund: Sigenergy kennt (Stand Protokoll V1.7) KEIN geraeteseitiges
Auto-Revert - ein kommandierter Remote-EMS-Zustand bleibt stehen, wenn
openHAB ausfaellt. Darum ruft der root-Timer ibm-failsafe
(setup/10-install-failsafe.sh) dieses Skript auf, wenn openHAB keinen
Heartbeat mehr schreibt oder nicht laeuft, und der Boot-Reset vor dem
openHAB-Start. Nur Standardbibliothek; der Modbus-Client entspricht dem in
spike_sigenstor.py (am Geraet erprobt 2026-10-02), bewusst ohne Import
daraus, damit der Produktionspfad nicht an einem Diagnosewerkzeug haengt.

    failsafe_reset.py --host 192.168.1.107 [--port 502] [--unit 247]

Sicherung gegen das falsche Geraet / die falsche Registerkarte (wie
__ibmSgGuard() im Adapter): geschrieben wird nur, wenn der EMS-Modus
(30003) lesbar und plausibel ist UND die Nennentladeleistung (30070) im
plausiblen Fenster liegt. Reads laufen - wie das ganze Profil - ueber FC04,
Writes ueber FC06, literal adressiert, Anlagenebene Slave 247.

Exit 0  Reset geschrieben und per Read-back bestaetigt (40029 == 0)
Exit 1  Geraet nicht erreichbar oder Modbus-Fehler
Exit 2  antwortet nicht wie eine SigenStor (Guard) - nichts geschrieben
Exit 3  Write angenommen, Read-back weicht ab (40029 != 0)
"""

import argparse
import socket
import struct
import sys
import time

# Registerkarte (Anlagenebene, Slave 247) - muss profile.sh / adapter.js
# entsprechen. Literal adressiert.
REG_EMS_MODE = 30003         # U16, 7 = Remote EMS aktiv
REG_RATED_DISCHARGE = 30070  # U32, W
REG_RMT_ENABLE = 40029       # U16, 0/1 - der eine Reset-Write

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


def u32_be(words):
    return (words[0] << 16) | words[1]


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", required=True, help="IP der Anlage")
    parser.add_argument("--port", type=int, default=502)
    parser.add_argument("--unit", type=int, default=247,
                        help="Anlagenebene = Slave-Adresse (Vorgabe 247)")
    args = parser.parse_args()

    dev = SigenStor(args.host, args.port, args.unit)
    try:
        # --- Guard: antwortet das wirklich wie eine SigenStor? --------------
        mode_before = dev.read(REG_EMS_MODE, 1)[0]
        if mode_before < 0 or mode_before > 10:
            print(f"EMS-Modus unplausibel (gelesen: {mode_before}) - "
                  f"keine SigenStor an {args.host}:{args.port}/{args.unit}, "
                  f"nichts geschrieben")
            return 2
        rated = u32_be(dev.read(REG_RATED_DISCHARGE, 2))
        if rated < RATED_MIN_W or rated > RATED_MAX_W:
            print(f"Nennentladeleistung unplausibel ({rated} W) - "
                  f"nichts geschrieben")
            return 2

        # --- Reset: der eine Write aus ibmReset() ---------------------------
        dev.write_u16(REG_RMT_ENABLE, 0)

        # Der EMS-Modus folgt dem Enable nicht sofort - dem Geraet kurz Zeit
        # geben, bevor der Read-back prueft (Spike-Reset: 2 s, dann Modus 0).
        time.sleep(2)

        # --- Read-back: FC04, Register muss stehen --------------------------
        enable_after = dev.read(REG_RMT_ENABLE, 1)[0]
        mode_after = dev.read(REG_EMS_MODE, 1)[0]
    except (OSError, ModbusError, ConnectionError) as e:
        print(f"{args.host}:{args.port} Slave {args.unit}: {e}")
        return 1
    finally:
        dev.close()

    ok = (enable_after == 0 and mode_after != EMS_WORK_MODE_REMOTE)
    print(f"vorher EMS-Modus {mode_before} -> Remote EMS enable 0 geschrieben "
          f"-> nachher enable {enable_after}, EMS-Modus {mode_after} "
          f"({'bestaetigt' if ok else 'ABWEICHUNG'})")
    return 0 if ok else 3


if __name__ == "__main__":
    sys.exit(main())
