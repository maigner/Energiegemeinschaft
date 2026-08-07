#!/usr/bin/env python3
"""Modbus-TCP-Simulator fuer ein Victron GX-Geraet (Venus OS, Systemebene).

Stellt die Register bereit, wie sie das Profil victron erwartet (offizielle
Victron-Registerkarte aus dbus_modbustcp, literal adressiert, Halteregister:
Lesen FC03, Schreiben FC06/FC16), und protokolliert jeden Schreibzugriff
auf stdout - damit laesst sich die komplette IBM-Installation ohne Anlage
testen:

    python3 sim_venus.py --port 5020

Braucht nur die Python-Standardbibliothek (kein pymodbus - dessen
Datastore-API hat sich zwischen 3.x-Versionen inkompatibel geaendert).
Unterstuetzt FC03/FC04 (Lesen), FC06/FC16 (Schreiben).

Vorgabewerte: Seriennummer SIMVENUS0001, SoC 55%, Batterieleistung 0 W,
ESS grid setpoint 50 W, DVCC MaxChargeCurrent -1 (unbegrenzt), ESS-Modus 1
(ESS mit Phasenkompensation), BatteryLife state 2 (Eigenverbrauch),
Minimum SoC 20,0%.

Der Simulator antwortet auf jede Unit-ID (also auch auf die von der
Registerkarte erwartete 100).
"""

import argparse
import datetime
import socketserver
import struct

SERIAL = "SIMVENUS0001"  # 12 ASCII-Zeichen = 6 Register (800..805)

# Registername je Adresse (S16-Werte als U16-Rohwert, -1 = 0xFFFF)
POINTS = {
    840:  ("Batteriespannung (V * 10)", 500),
    841:  ("Batteriestrom (A * 10)", 0),
    842:  ("Batterieleistung (W, + laden)", 0),
    843:  ("Ladestand (%)", 55),
    844:  ("Batteriezustand (0=idle)", 0),
    2700: ("ESS grid setpoint (W)", 50),
    2701: ("ESS MaxChargePercentage", 100),
    2702: ("ESS MaxDischargePercentage", 100),
    2703: ("ESS grid setpoint (W / 100)", 0),
    2704: ("ESS MaxDischargePower (W / 10)", 0xFFFF),
    2705: ("DVCC MaxChargeCurrent (A)", 0xFFFF),
    2706: ("ESS MaxFeedInPower (W / 100)", 0xFFFF),
    2707: ("DC-PV-Ueberschuss einspeisen", 1),
    2708: ("AC-PV-Ueberschuss NICHT einspeisen", 0),
    2900: ("BatteryLife state", 2),
    2901: ("ESS Minimum SoC (% * 10)", 200),
    2902: ("ESS Mode (Hub4Mode)", 1),
}

# Die Poller des Profils lesen 840..843, 2700..2708 und 2900..2902 -
# grosszuegig mit Nullen auffuellen, konkrete Vorgabewerte darueberlegen.
REGS = {addr: 0 for addr in range(800, 850)}
REGS.update({addr: 0 for addr in range(2700, 2720)})
REGS.update({addr: 0 for addr in range(2900, 2910)})
for _i in range(6):
    _chunk = SERIAL[2 * _i:2 * _i + 2].ljust(2, "\x00").encode("ascii")
    REGS[800 + _i] = struct.unpack(">H", _chunk)[0]
for _addr, (_, _value) in POINTS.items():
    REGS[_addr] = _value


def point_name(address):
    if address in POINTS:
        return POINTS[address][0]
    return "?"


def log_write(address, value):
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    signed = value - 0x10000 if value >= 0x8000 else value
    print(f"[SIM] {stamp} WRITE {address} ({point_name(address)}) = {value}"
          f" (signed {signed})", flush=True)


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

    print(f"[SIM] Venus-Simulator auf {args.host}:{args.port}")
    print(f"[SIM] Seriennummer={SERIAL}, SoC={POINTS[843][1]}%, "
          f"Setpoint={POINTS[2700][1]} W, ESS-Modus={POINTS[2902][1]}",
          flush=True)
    with Server((args.host, args.port), Handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
