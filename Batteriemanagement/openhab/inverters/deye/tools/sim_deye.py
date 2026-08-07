#!/usr/bin/env python3
"""Modbus-TCP-Simulator fuer einen Deye-Niedervolt-Hybrid (SG04LP3/SG05LP3).

Stellt die Register bereit, wie sie das Profil deye erwartet (proprietaere
Deye-Registerkarte der 3-phasigen Niedervolt-Familie, literal und 0-basiert
adressiert, Reads per FC03), und protokolliert jeden Schreibzugriff auf
stdout - damit laesst sich die komplette IBM-Installation ohne Anlage und
ohne RS485-Gateway testen:

    python3 sim_deye.py --port 5020

Braucht nur die Python-Standardbibliothek (kein pymodbus - dessen
Datastore-API hat sich zwischen 3.x-Versionen inkompatibel geaendert).
Unterstuetzt FC03/FC04 (Lesen), FC06/FC16 (Schreiben).

Vorgabewerte: Work Mode 0 (Selling first), Solar Sell 1, TOU aus,
Slot-Zeiten 00:00/04:00/08:00/12:00/16:00/20:00, Slot-Leistung je 5000 W,
Slot-Ziel-SoC je 20 %, SoC 55 %, Batterieleistung 0 W, Max sell power
15000 W.

Der Simulator antwortet auf jede Slave-Adresse (also auch auf die vom
Profil erwartete 1).
"""

import argparse
import datetime
import socketserver
import struct

POINTS = {
    142: ("Work Mode", 0),
    143: ("Max sell power", 15000),
    145: ("Solar Sell", 1),
    146: ("Time of Use enable", 0),
    148: ("TOU Slot 1 Beginn", 0),
    149: ("TOU Slot 2 Beginn", 400),
    150: ("TOU Slot 3 Beginn", 800),
    151: ("TOU Slot 4 Beginn", 1200),
    152: ("TOU Slot 5 Beginn", 1600),
    153: ("TOU Slot 6 Beginn", 2000),
    154: ("TOU Slot 1 Leistung", 5000),
    155: ("TOU Slot 2 Leistung", 5000),
    156: ("TOU Slot 3 Leistung", 5000),
    157: ("TOU Slot 4 Leistung", 5000),
    158: ("TOU Slot 5 Leistung", 5000),
    159: ("TOU Slot 6 Leistung", 5000),
    160: ("TOU Slot 1 Spannung", 4900),
    161: ("TOU Slot 2 Spannung", 4900),
    162: ("TOU Slot 3 Spannung", 4900),
    163: ("TOU Slot 4 Spannung", 4900),
    164: ("TOU Slot 5 Spannung", 4900),
    165: ("TOU Slot 6 Spannung", 4900),
    166: ("TOU Slot 1 Ziel-SoC", 20),
    167: ("TOU Slot 2 Ziel-SoC", 20),
    168: ("TOU Slot 3 Ziel-SoC", 20),
    169: ("TOU Slot 4 Ziel-SoC", 20),
    170: ("TOU Slot 5 Ziel-SoC", 20),
    171: ("TOU Slot 6 Ziel-SoC", 20),
    172: ("TOU Slot 1 Flags", 0),
    173: ("TOU Slot 2 Flags", 0),
    174: ("TOU Slot 3 Flags", 0),
    175: ("TOU Slot 4 Flags", 0),
    176: ("TOU Slot 5 Flags", 0),
    177: ("TOU Slot 6 Flags", 0),
    587: ("Batteriespannung", 5230),
    588: ("Batterie-SoC", 55),
    590: ("Batterieleistung", 0),
}

# Die Poller des Profils lesen 142..177 und 587..590 - grosszuegig mit
# Nullen auffuellen, konkrete Vorgabewerte darueberlegen.
REGS = {addr: 0 for addr in range(0, 700)}
for _addr, (_, _value) in POINTS.items():
    REGS[_addr] = _value


def point_name(address):
    if address in POINTS:
        return POINTS[address][0]
    return "?"


def log_write(address, value):
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"[SIM] {stamp} WRITE {address} ({point_name(address)}) = {value}",
          flush=True)


def exception_pdu(fc, code):
    return struct.pack(">BB", fc | 0x80, code)


def process(pdu):
    """Verarbeitet eine Modbus-PDU und liefert die Antwort-PDU."""
    fc = pdu[0]
    if fc in (3, 4):  # Read Holding / Read Input Registers
        addr, count = struct.unpack(">HH", pdu[1:5])
        if count < 1 or count > 125:
            return exception_pdu(fc, 0x03)
        try:
            values = [REGS[a] for a in range(addr, addr + count)]
        except KeyError:
            return exception_pdu(fc, 0x02)
        return struct.pack(">BB", fc, count * 2) \
            + struct.pack(f">{count}H", *values)
    if fc == 6:  # Write Single Register
        addr, value = struct.unpack(">HH", pdu[1:5])
        if addr not in REGS:
            return exception_pdu(fc, 0x02)
        REGS[addr] = value
        log_write(addr, value)
        return pdu[:5]
    if fc == 16:  # Write Multiple Registers
        addr, count, nbytes = struct.unpack(">HHB", pdu[1:6])
        if count < 1 or count > 123 or nbytes != count * 2:
            return exception_pdu(fc, 0x03)
        if any(a not in REGS for a in range(addr, addr + count)):
            return exception_pdu(fc, 0x02)
        values = struct.unpack(f">{count}H", pdu[6:6 + nbytes])
        for i, value in enumerate(values):
            REGS[addr + i] = value
            log_write(addr + i, value)
        return struct.pack(">BHH", fc, addr, count)
    return exception_pdu(fc, 0x01)


def recvall(sock, n):
    data = b""
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            return None
        data += chunk
    return data


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        while True:
            header = recvall(self.request, 7)
            if header is None:
                return
            tid, _proto, length, unit = struct.unpack(">HHHB", header)
            pdu = recvall(self.request, length - 1)
            if pdu is None or not pdu:
                return
            resp = process(pdu)
            self.request.sendall(
                struct.pack(">HHHB", tid, 0, len(resp) + 1, unit) + resp)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5020,
                        help="TCP-Port (502 braucht root; Vorgabe 5020)")
    args = parser.parse_args()

    print(f"[SIM] Deye-Simulator auf {args.host}:{args.port}")
    print(f"[SIM] SoC={POINTS[588][1]}%, Work Mode={POINTS[142][1]}, "
          f"TOU enable={POINTS[146][1]}, "
          f"Max sell power={POINTS[143][1]} W", flush=True)
    with Server((args.host, args.port), Handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
