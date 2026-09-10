#!/usr/bin/env python3
"""Modbus-TCP-Simulator fuer den Fronius Datamanager (SunSpec Model 124).

Stellt den Basic-Storage-Control-Block bereit, wie ihn das Profil
fronius-snapinverter erwartet (int + SF, Basisadresse 40303 laut
Fronius-Anleitung 42,0410,2049 S. 47; --float legt ihn wie die
Float-Karte auf 40313), samt "SunS"-Kennung und SunSpec-Modellkette
(Common 1, Inverter 103, 120, 121, 122, 123, 160, 124, Ende) fuer den
Kettenlauf des Spike-Skripts, und protokolliert jeden Schreibzugriff auf
stdout - damit laesst sich die komplette IBM-Installation ohne Anlage
testen:

    python3 sim_datamanager.py --port 5020

Braucht nur die Python-Standardbibliothek (kein pymodbus - dessen
Datastore-API hat sich zwischen 3.x-Versionen inkompatibel geaendert).
Unterstuetzt FC03/FC04 (Lesen), FC06/FC16 (Schreiben).

Vorgabewerte: SoC 55% (ChaState 5500, SF -2), WChaMax 5000 W (SF 0),
InWRte/OutWRte 100% (10000, SF -2), StorCtl_Mod 0, RvrtTms 0.
Wie der echte Datamanager laut Registerkarte weist der Simulator Writes
auf die nur lesbaren Register (ID, L, WChaMax, ChaState, ChaSt, WinTms,
RvrtTms, RmpTms, Skalierungsfaktoren) mit Exception 02 ab; --lax erlaubt
sie. Nur die konfigurierte Unit-ID (--unit, Vorgabe 1) antwortet mit dem
Modell; jede andere liefert Exception 0B (Gateway Target Failed), so wie
der Datamanager fuer eine unbekannte Wechselrichter-Nummer.
"""

import argparse
import datetime
import socketserver
import struct

M124_BASE_INTSF = 40303
M124_BASE_FLOAT = 40313
M124_BASE = M124_BASE_INTSF

# Modellkette der int+SF-Karte des Datamanagers: (ID, Laenge L)
# Common 1 (65) ab 40002, I103 (50), I120 (26), I121 (30), I122 (44),
# I123 (24), I160 (48 bei 2 Modulen) -> IC124 ab 40303 (0-basiert).
# Die Float-Karte hat statt I103 das I113 mit L=60 - alles danach
# verschiebt sich um 10 Register, IC124 liegt dann ab 40313.
CHAIN_INTSF = [(1, 65), (103, 50), (120, 26), (121, 30), (122, 44),
               (123, 24), (160, 48), (124, 24)]
CHAIN_FLOAT = [(1, 65), (113, 60), (120, 26), (121, 30), (122, 44),
               (123, 24), (160, 48), (124, 24)]
CHAIN = CHAIN_INTSF

# Offsets, die laut Registerkarte nur lesbar sind (RW = 5, 7, 12, 13, 17)
WRITABLE_OFFSETS = {5, 7, 12, 13, 17}
LAX = False
UNIT_ID = 1

POINTS = {
    0: ("ID", 124),
    1: ("L", 24),
    2: ("WChaMax", 5000),
    3: ("WChaGra", 100),
    4: ("WDisChaGra", 100),
    5: ("StorCtl_Mod", 0),
    6: ("VAChaMax", 0),
    7: ("MinRsvPct", 500),
    8: ("ChaState", 5500),
    9: ("StorAval", 0),
    10: ("InBatV", 0),
    11: ("ChaSt", 3),
    12: ("OutWRte", 10000),
    13: ("InWRte", 10000),
    14: ("InOutWRte_WinTms", 0),
    15: ("InOutWRte_RvrtTms", 0),
    16: ("InOutWRte_RmpTms", 0),
    17: ("ChaGriSet", 0),
    18: ("WChaMax_SF", 0),
    19: ("WChaDisChaGra_SF", 0),
    20: ("VAChaMax_SF", 0),
    21: ("MinRsvPct_SF", 0xFFFE),   # -2 (int16, Zweierkomplement)
    22: ("ChaState_SF", 0xFFFE),    # -2
    23: ("StorAval_SF", 0),
    24: ("InBatV_SF", 0),
    25: ("InOutWRte_SF", 0xFFFE),   # -2
}

# Adressraum wie beim echten Datamanager grosszuegig mit Nullen fuellen,
# den Model-124-Block darueberlegen. Adressen sind 0-basiert, genau wie
# readStart/writeStart im openHAB-Modbus-Binding.
REGS = {addr: 0 for addr in range(40000, 40400)}


def put_str(addr, text, nregs):
    raw = text.encode("ascii").ljust(nregs * 2, b"\0")
    for i in range(nregs):
        REGS[addr + i] = (raw[2 * i] << 8) | raw[2 * i + 1]


def build_map(chain):
    """Legt "SunS", die Modellkette und den Model-124-Block in REGS;
    liefert die Basisadresse von Model 124."""
    for addr in REGS:
        REGS[addr] = 0
    REGS[40000], REGS[40001] = 0x5375, 0x6E53  # "SunS"
    addr = 40002
    base = None
    for model_id, length in chain:
        REGS[addr], REGS[addr + 1] = model_id, length
        if model_id == 1:
            # Common Block: Mn(16) Md(16) Opt(8) Vr(8) SN(16) DA(1)
            put_str(addr + 2, "Fronius", 16)
            put_str(addr + 18, "Symo Hybrid 5.0-3-S", 16)
            put_str(addr + 42, "sim-1.0", 8)
            put_str(addr + 50, "SIM0000001", 16)
            REGS[addr + 66] = UNIT_ID
        if model_id == 160:
            # DCW_SF (+5), N = 2 (+9), Module "String 1"/"String 2" (+11, +31)
            REGS[addr + 4] = 0
            REGS[addr + 8] = 2
            for i, (name, dcw) in enumerate((("String 1", 1200), ("String 2", 800))):
                m = addr + 10 + i * 20
                REGS[m] = i + 1
                put_str(m + 1, name, 8)
                REGS[m + 11] = dcw
        if model_id == 124:
            base = addr
        addr += 2 + length
    REGS[addr] = 0xFFFF  # Ende der Kette
    REGS[addr + 1] = 0
    for offset, (_, value) in POINTS.items():
        REGS[base + offset] = value
    return base


build_map(CHAIN)


def point_name(address):
    offset = address - M124_BASE
    if offset in POINTS:
        return POINTS[offset][0]
    return "?"


def as_int16(value):
    return value - 0x10000 if value >= 0x8000 else value


def log_write(address, value):
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"[SIM] {stamp} WRITE {address} ({point_name(address)}) = "
          f"{value} (int16: {as_int16(int(value))})", flush=True)


def writable(address):
    if LAX:
        return True
    return (address - M124_BASE) in WRITABLE_OFFSETS


def log_reject(address, value):
    stamp = datetime.datetime.now().strftime("%H:%M:%S")
    print(f"[SIM] {stamp} WRITE {address} ({point_name(address)}) = {value} "
          f"ABGEWIESEN (nur lesbar, Exception 02)", flush=True)


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
        if addr not in REGS or not writable(addr):
            log_reject(addr, value)
            return exception_pdu(fc, 0x02)
        REGS[addr] = value
        log_write(addr, value)
        return pdu[:5]
    if fc == 16:  # Write Multiple Registers
        addr, count, nbytes = struct.unpack(">HHB", pdu[1:6])
        if count < 1 or count > 123 or nbytes != count * 2:
            return exception_pdu(fc, 0x03)
        if any(a not in REGS or not writable(a) for a in range(addr, addr + count)):
            log_reject(addr, "...")
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
            if unit == UNIT_ID:
                resp = process(pdu)
            else:
                # Datamanager: unbekannte Wechselrichter-Nummer
                resp = exception_pdu(pdu[0], 0x0B)
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
    parser.add_argument("--unit", type=int, default=1,
                        help="Unit-ID des simulierten Hybrid (Vorgabe 1)")
    parser.add_argument("--float", action="store_true",
                        help="Model 124 wie bei der Float-Karte auf 40313 legen")
    parser.add_argument("--lax", action="store_true",
                        help="Writes auch auf nur lesbare Register annehmen")
    args = parser.parse_args()

    global M124_BASE, LAX, UNIT_ID
    LAX = args.lax
    UNIT_ID = args.unit
    M124_BASE = build_map(CHAIN_FLOAT if args.float else CHAIN_INTSF)
    assert M124_BASE == (M124_BASE_FLOAT if args.float else M124_BASE_INTSF)

    print(f"[SIM] Datamanager-Simulator auf {args.host}:{args.port}, "
          f"Unit-ID {UNIT_ID}")
    print(f"[SIM] Model 124 ab Adresse {M124_BASE} (ID={POINTS[0][1]}, "
          f"WChaMax={POINTS[2][1]}, ChaState={POINTS[8][1]}); "
          f"RvrtTms {'beschreibbar (--lax)' if LAX else 'nur lesbar'}",
          flush=True)
    with Server((args.host, args.port), Handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
