#!/usr/bin/env python3
"""Modbus-TCP-Simulator fuer eine Sigenergy SigenStor (Anlagenebene).

Stellt die Plant-Register bereit, wie sie das Profil sigenergy erwartet
(proprietaere Sigenergy-Registerkarte, literal adressiert, Reads per FC04
auch fuer die beschreibbaren Register), und protokolliert jeden
Schreibzugriff auf stdout - damit laesst sich die komplette
IBM-Installation ohne Anlage testen:

    python3 sim_sigenstor.py --port 5020

Braucht nur die Python-Standardbibliothek (kein pymodbus - dessen
Datastore-API hat sich zwischen 3.x-Versionen inkompatibel geaendert).
Unterstuetzt FC03/FC04 (Lesen), FC06/FC16 (Schreiben).

Vorgabewerte: EMS work mode 0 (Eigenverbrauch), SoC 55,0% (550, Gain 10),
ESS power 0 W, Max active power 25000 W, Nennlade-/-entladeleistung je
8000 W, alle Remote-EMS-Register 0.

Der Simulator antwortet auf jede Slave-Adresse (also auch auf die von der
Anlage erwartete 247).
"""

import argparse
import datetime
import socketserver
import struct

# Registername je Adresse (U32-Werte belegen Adresse und Adresse+1)
POINTS = {
    30003: ("EMS work mode", 0),
    30010: ("Max active power (hi)", 0),
    30011: ("Max active power (lo)", 25000),
    30014: ("Plant ESS SoC", 550),
    30037: ("ESS power (hi)", 0),
    30038: ("ESS power (lo)", 0),
    30068: ("Rated ESS charging power (hi)", 0),
    30069: ("Rated ESS charging power (lo)", 8000),
    30070: ("Rated ESS discharging power (hi)", 0),
    30071: ("Rated ESS discharging power (lo)", 8000),
    40029: ("Remote EMS enable", 0),
    40030: ("Independent phase power control", 0),
    40031: ("Remote EMS control mode", 0),
    40032: ("ESS max charging limit (hi)", 0),
    40033: ("ESS max charging limit (lo)", 0),
    40034: ("ESS max discharging limit (hi)", 0),
    40035: ("ESS max discharging limit (lo)", 0),
    40036: ("PV max power limit (hi)", 0),
    40037: ("PV max power limit (lo)", 0),
}

# Die Poller des Profils lesen 30003..30038, 30068..30071 und 40029..40037 -
# grosszuegig mit Nullen auffuellen, konkrete Vorgabewerte darueberlegen.
REGS = {addr: 0 for addr in range(30000, 30090)}
REGS.update({addr: 0 for addr in range(40000, 40060)})
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

    print(f"[SIM] SigenStor-Simulator auf {args.host}:{args.port}")
    print(f"[SIM] SoC={POINTS[30014][1] / 10}%, "
          f"Nennentladeleistung={POINTS[30071][1]} W, "
          f"EMS work mode={POINTS[30003][1]}", flush=True)
    with Server((args.host, args.port), Handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
