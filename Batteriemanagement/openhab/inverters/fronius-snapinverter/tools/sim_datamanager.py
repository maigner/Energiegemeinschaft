#!/usr/bin/env python3
"""Modbus-TCP-Simulator fuer den Fronius Datamanager (SunSpec Model 124).

Stellt den Basic-Storage-Control-Block bereit, wie ihn das Profil
fronius-snapinverter erwartet (int + SF, Basisadresse 40313), und
protokolliert jeden Schreibzugriff auf stdout - damit laesst sich die
komplette IBM-Installation ohne Anlage testen:

    pip install pymodbus
    python3 sim_datamanager.py --port 5020

Vorgabewerte: SoC 55% (ChaState 5500, SF -2), WChaMax 5000 W (SF 0),
InWRte/OutWRte 100% (10000, SF -2), StorCtl_Mod 0, RvrtTms 0.

Getestet mit pymodbus 3.x.
"""

import argparse
import datetime

from pymodbus.datastore import (
    ModbusServerContext,
    ModbusSlaveContext,
    ModbusSparseDataBlock,
)
from pymodbus.server import StartTcpServer

M124_BASE = 40313

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


def point_name(address):
    offset = address - M124_BASE
    if offset in POINTS:
        return POINTS[offset][0]
    return "?"


def as_int16(value):
    return value - 0x10000 if value >= 0x8000 else value


class LoggingBlock(ModbusSparseDataBlock):
    """Holding-Register-Block, der jeden Schreibzugriff protokolliert."""

    def setValues(self, address, values):
        if not isinstance(values, (list, tuple)):
            values = [values]
        stamp = datetime.datetime.now().strftime("%H:%M:%S")
        for i, value in enumerate(values):
            addr = address + i
            print(
                f"[SIM] {stamp} WRITE {addr} ({point_name(addr)}) = "
                f"{value} (int16: {as_int16(int(value))})",
                flush=True,
            )
        super().setValues(address, values)


def build_context():
    registers = {addr: 0 for addr in range(40000, 40400)}
    for offset, (_, value) in POINTS.items():
        registers[M124_BASE + offset] = value
    block = LoggingBlock(registers)
    # zero_mode=True: Datastore-Adressen sind die Protokolladressen (0-basiert),
    # genau wie readStart/writeStart im openHAB-Modbus-Binding.
    slave = ModbusSlaveContext(hr=block, zero_mode=True)
    return ModbusServerContext(slaves=slave, single=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5020,
                        help="TCP-Port (502 braucht root; Vorgabe 5020)")
    args = parser.parse_args()

    print(f"[SIM] Datamanager-Simulator auf {args.host}:{args.port}")
    print(f"[SIM] Model 124 ab Adresse {M124_BASE} (ID={POINTS[0][1]}, "
          f"WChaMax={POINTS[2][1]}, ChaState={POINTS[8][1]})", flush=True)
    StartTcpServer(context=build_context(), address=(args.host, args.port))


if __name__ == "__main__":
    main()
