#!/usr/bin/env python3
"""Spike-Ergaenzung: Schreibpfad ueber openHAB-Items und Ladesperre bei Sonne.

Nach `spike_datamanager.py` (direkt per Modbus) prueft dieses Skript den
Pfad, den der Adapter im Betrieb wirklich nutzt: Item-Command per REST ->
Modbus-Binding (writeValueType int16) -> Datamanager. Es schreibt NIE direkt
per Modbus, liest aber einmal je Phase mit `spike_datamanager.py reads`
gegen, ob die Register wirklich so stehen, wie die Items behaupten.

Ablauf (ca. 12 Minuten, laeuft auf dem Pi als openhabian):

    Baseline 30 s
    Entladung --watts (Fronius-Beispiel 6: InWRte -x, OutWRte +x, StorCtl 3),
        4 min - macht bei vollem Speicher Platz und misst die Latenz
    Freigabe (Reset), 2,5 min - Batterie laedt aus PV-Ueberschuss (P_Akku < 0)
    Ladesperre (Beispiel 2: InWRte 0, StorCtl 1), 3 min - P_Akku darf nicht
        negativ bleiben (Spike-Punkt 5 bei Sonne)
    Reset, 2 min - Laden setzt wieder ein

Sinnvoll nur bei PV-Ueberschuss (P_Grid negativ in der Solar API) und mit
Hauptschalter OFF, damit der Core nicht dazwischenfunkt. Bei Abbruch oder
Fehler wird ueber die Items UND direkt per Modbus zurueckgesetzt.

    python3 spike_openhab.py 192.168.68.56 --watts 2000

Ergebnis auf pi-020 (2026-09-12) im README unter "Nachtrag 2026-09-12".
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = os.path.join(HERE, "spike_datamanager.py")
ITEMS = ("SoC", "ChaSt", "StorCtl", "InWRte", "OutWRte")

args = None
LOG = None


def log(s):
    line = f"[{time.strftime('%H:%M:%S')}] {s}"
    print(line, flush=True)
    LOG.write(line + "\n")
    LOG.flush()


def get(url, timeout=15):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read().decode()


def item(name):
    return get(f"{args.openhab}/rest/items/{args.prefix}{name}/state", 5)


def cmd(name, value):
    req = urllib.request.Request(f"{args.openhab}/rest/items/{args.prefix}{name}",
                                 data=str(value).encode(), method="POST",
                                 headers={"Content-Type": "text/plain"})
    if args.token:
        req.add_header("Authorization", "Bearer " + args.token)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            code = r.status
    except urllib.error.HTTPError as e:
        code = e.code
    log(f"  CMD {args.prefix}{name} <- {value}  (HTTP {code})")
    if code not in (200, 202):
        raise RuntimeError(f"Item-Command abgelehnt: HTTP {code} (Token noetig? --token)")


def powerflow():
    d = json.loads(get(f"http://{args.host}/solar_api/v1/GetPowerFlowRealtimeData.fcgi"))
    s = d["Body"]["Data"]["Site"]
    return {k: s.get(k) for k in ("P_PV", "P_Akku", "P_Grid", "P_Load", "BatteryStandby")}


def num(v):
    return isinstance(v, (int, float))


def sample(tag=""):
    try:
        pf = powerflow()
    except Exception as e:  # Solar API darf zwischendurch ausfallen
        pf = {"err": str(e)[:40]}
    it = {n: item(n) for n in ITEMS}
    fmt = lambda v: f"{v:+6.0f}" if num(v) else str(v)
    log(f"  {tag:<9} SoC {it['SoC']:>6} ChaSt {it['ChaSt']} StorCtl {it['StorCtl']:>4} "
        f"In {it['InWRte']:>6} Out {it['OutWRte']:>6} | P_PV {fmt(pf.get('P_PV'))} "
        f"P_Akku {fmt(pf.get('P_Akku'))} P_Grid {fmt(pf.get('P_Grid'))} "
        f"Standby {pf.get('BatteryStandby')}")
    return pf, it


def observe(seconds, tag, until=None):
    t0 = time.time()
    hit = None
    while time.time() - t0 < seconds:
        pf, it = sample(tag)
        if until and hit is None and until(pf, it):
            hit = round(time.time() - t0)
            log(f"  -> Bedingung erreicht nach {hit} s")
        time.sleep(10)
    return hit


def modbus_reads():
    out = subprocess.run([sys.executable, SPIKE, args.host, "--no-api", "--log",
                          args.spike_log, "reads"], capture_output=True, text=True,
                         timeout=90).stdout
    for l in out.splitlines():
        if any(k in l for k in ("StorCtl_Mod", "InWRte", "OutWRte", "ChaSt ", "ChaState ")):
            log("  Modbus direkt: " + l.split("]", 1)[-1].strip())


def reset():
    log("== RESET ueber openHAB: InWRte 10000, OutWRte 10000, StorCtl 0 ==")
    cmd("InWRte", 10000)
    cmd("OutWRte", 10000)
    cmd("StorCtl", 0)


def akku_over(w):
    return lambda pf, it: num(pf.get("P_Akku")) and pf["P_Akku"] > w


def akku_under(w):
    return lambda pf, it: num(pf.get("P_Akku")) and pf["P_Akku"] < w


def run():
    log(f"=== Spike openHAB-Schreibpfad + Ladesperre bei Sonne: {args.host}, "
        f"{args.watts} W, openHAB {args.openhab} ===")
    log("== Auth-Probe: InWRte <- aktueller Wert ==")
    cmd("InWRte", item("InWRte"))
    log("== BASELINE 30 s ==")
    observe(30, "base")

    wch = float(item("WChaMax"))
    pct = max(1, min(100, round(args.watts / wch * 100)))
    log(f"== DISCHARGE ueber openHAB: {args.watts} W = {pct} % von {wch:.0f} W "
        f"(In -{pct * 100}, Out +{pct * 100}, StorCtl 3) ==")
    cmd("InWRte", -pct * 100)
    cmd("OutWRte", pct * 100)
    cmd("StorCtl", 3)
    lat = observe(240, "discharge", akku_over(0.5 * args.watts))
    log(f"  Latenz Kommando -> P_Akku > {args.watts // 2} W: {lat} s")
    modbus_reads()

    log("== FREIGABE (Reset) - Erwartung: Batterie laedt aus PV-Ueberschuss, P_Akku < 0 ==")
    reset()
    lat = observe(150, "release", akku_under(-200))
    log(f"  Laden nach Freigabe (P_Akku < -200 W) nach: {lat} s")

    log("== PREVENT ueber openHAB: InWRte 0, StorCtl 1 - Erwartung: P_Akku nicht mehr negativ ==")
    cmd("InWRte", 0)
    cmd("StorCtl", 1)
    lat = observe(180, "prevent", akku_over(-50))
    log(f"  Ladestopp (P_Akku > -50 W) nach: {lat} s")
    modbus_reads()

    log("== RESET - Erwartung: Laden setzt wieder ein ==")
    reset()
    lat = observe(120, "reset", akku_under(-200))
    log(f"  Laden nach Reset (P_Akku < -200 W) nach: {lat} s")
    modbus_reads()
    log("=== Fertig ===")


def main():
    global args, LOG
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("host", help="IP des Datamanagers (Modbus + Solar API)")
    ap.add_argument("--watts", type=int, default=2000, help="Entladeleistung (Vorgabe 2000)")
    ap.add_argument("--openhab", default="http://127.0.0.1:8080")
    ap.add_argument("--token", default=os.environ.get("OH_TOKEN"),
                    help="API-Token, falls openHAB Commands nicht anonym annimmt")
    ap.add_argument("--prefix", default="IBM_MB_", help="Item-Praefix (Vorgabe IBM_MB_)")
    ap.add_argument("--log", default="spike_openhab.log")
    ap.add_argument("--spike-log", default="spike_datamanager.log",
                    help="Log fuer die direkten Reads mit spike_datamanager.py")
    args = ap.parse_args()
    LOG = open(args.log, "a")
    try:
        run()
    except BaseException as e:
        log(f"ABBRUCH: {e!r} - Reset ueber openHAB und direkt per Modbus")
        try:
            reset()
        except Exception as e2:
            log(f"  Reset per openHAB fehlgeschlagen: {e2!r}")
        subprocess.run([sys.executable, SPIKE, args.host, "--no-api", "--yes",
                        "--log", args.spike_log, "reset"], timeout=90)
        sys.exit(1)


if __name__ == "__main__":
    main()
