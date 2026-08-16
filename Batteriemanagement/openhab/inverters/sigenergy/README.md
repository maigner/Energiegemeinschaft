# Sigenergy SigenStor (Modbus)

Profil fuer Sigenergy-SigenStor-Anlagen (modularer Hybrid-Wechselrichter mit
Batteriestack). Gesteuert wird ueber **Modbus TCP** und den **Remote
EMS**-Modus des Sigenergy-Modbus-Protokolls - eine proprietaere
Registerkarte auf Anlagenebene (Slave-Adresse 247), kein SunSpec:

| IBM-Aktion | Umsetzung |
| --- | --- |
| Reset (Werksverhalten) | `Remote EMS enable (40029) = 0` - die Anlage folgt wieder ihrem konfigurierten EMS-Modus |
| Ladesperre | Modus 5 (Entladung, PV zuerst) + `ESS max discharging limit (40034) = 0` |
| Laderegelung | KEIN `ibmLimitCharge` - die Command-Charging-Modi koennten aus dem Netz laden und das Ladelimit-Register ist nicht verifiziert (Spike-Punkt); der Kern nutzt die PWM ueber die Ladesperre |
| Forcierte Entladung | Modus 6 (Entladung, Batterie zuerst) + Entladelimit in Watt |
| Fail-Safe | KEIN geraeteseitiges Auto-Revert bekannt - siehe Fail-Safe-Analyse |

Besonderheiten gegenueber den SunSpec-Profilen:

- Leistungslimits werden **direkt in Watt** geschrieben (Registerwert = W,
  da Gain 1000 auf kW) - `appliedW` ist exakt, keine Prozent-Quantisierung.
- Alle Reads laufen ueber **FC04** (Input-Register), auch fuer die
  beschreibbaren Halteregister; geschrieben wird mit FC06/FC16. Die Poller
  des Profils stehen deshalb auf `type: input`.
- Sigenergy adressiert **literal**: Registeradresse 30014 heisst Adresse
  30014 im Request (kein 30001er-Offset).
- Das **PV-Limit (40036) wirkt in allen Kommando-Modi 3 bis 6**. Der
  Adapter setzt es vor jedem Steuerbefehl auf das Anlagenmaximum (30010),
  damit ein Altwert im Register die PV-Erzeugung nicht begrenzt.

Quelle der Registerkarte: Sigenergy Modbus Protocol V1.7 (2024-04-09);
aktuell ist V2.x - Abweichungen im Spike pruefen.

## Voraussetzungen an der Anlage

In der mySigen-App (teils nur mit Installateur-Zugang):

1. **"ModBus TCP Server Enable"** aktivieren - Port 502
2. **"Remote EMS Scheduling Enable"** aktivieren - ohne das ignoriert die
   Anlage die Remote-EMS-Register

Die Steuerung laeuft auf **Anlagenebene** (Slave 247): bei Anlagen mit
mehreren SigenStor-Tuermen wird der gesamte Verbund kommandiert, nicht ein
einzelner Wechselrichter.

## Spike: Registerkarte am Geraet verifizieren (VOR der ersten Installation)

Die Adressen in `profile.sh` und die Konstanten in `adapter.js` folgen dem
offiziellen Sigenergy-Modbus-Protokoll (V1.7), sind aber noch **nicht am
Geraet verifiziert**. Werkzeug: `mbpoll` oder ein kurzes pymodbus-Skript im
LAN der Anlage; zum Testen ohne Anlage siehe `tools/sim_sigenstor.py`.

Checkliste (Ergebnis in die Tabelle unten eintragen, danach `profile.sh`/
`adapter.js` anpassen):

1. mySigen-App: beide Schalter (Modbus TCP, Remote EMS Scheduling)
   aktivieren; Firmwarestand und Protokollversion der Anlage dokumentieren.
2. Reads an Slave 247 verifizieren: `EMS work mode` (30003), `Plant ESS
   SoC` (30014, Erwartung: Wert = % * 10, gegen die App-Anzeige pruefen ->
   `MODBUS_SOC_GAIN`), `ESS power` (30037, Vorzeichen: > 0 = laden ->
   `MODBUS_ESS_POWER_GAIN`), Nennleistungen (30068/30070).
3. U32-Wortreihenfolge pruefen (Erwartung: Big Endian, High-Word zuerst -
   sonst `uint32`/`int32` im Thing-Manifest gegen die `_swap`-Varianten
   tauschen).
4. Remote EMS einschalten (`40029 = 1`) und pruefen, dass `EMS work mode`
   (30003) auf 7 springt; wieder ausschalten, Modus faellt zurueck.
5. Modus-Wertetabelle (Appendix 6) bestaetigen: 3/4 = kommandiertes Laden,
   5/6 = kommandierte Entladung -> `SIGEN_MODE_*` in `adapter.js`.
6. Ladesperre testen: Modus 5 + Entladelimit 0. Pruefen: Batterie laedt
   NICHT (auch bei PV-Ueberschuss), Batterie entlaedt nicht, PV versorgt
   Haushalt und Netz normal weiter. Falls PV dabei einbricht oder die
   Anlage den Zustand nicht annimmt: Alternative Modus 1 (Standby) testen
   und `SIGEN_MODE_PREVENT_CHARGE` anpassen.
7. **PV-Limit (40036)**: Default-Wert nach Werksreset lesen; Verhalten
   pruefen, wenn es beim Eintritt in einen Kommando-Modus 0 oder klein ist.
   Bestaetigen, dass das Setzen auf das Anlagenmaximum (30010) die
   PV-Erzeugung freigibt.
8. Forcierte Entladung testen: Modus 6 + Entladelimit x W; AC-Leistung
   gegen die App/einen Zaehler messen (Erwartung: Registerwert = W).
   Verhalten bei Limit > Nennleistung dokumentieren (Fehlercode oder
   stilles Klemmen?).
9. **Fail-Safe (Go/No-Go)**: Remote EMS mit aktiver Entladung stehen
   lassen und den Modbus-Master trennen (openHAB stoppen). Faellt die
   Anlage nach einem Timeout von selbst in den Normalbetrieb zurueck?
   Ergebnis -> `SIGEN_HAS_AUTO_REVERT` in `adapter.js` (nur Doku) und
   Abschnitt Fail-Safe-Analyse unten. Auch klaeren: beschreibt die
   aktuelle Protokollversion (V2.x, "interaction timeout") ein solches
   Verhalten?
10. Dauerverhalten: bleibt der kommandierte Zustand ueber Stunden stehen
    oder muss er zyklisch erneuert werden? (IBM kommandiert ohnehin alle
    5 Minuten neu.)

### Registertabelle (im Spike ausfuellen)

| Register | Adresse | Typ | Gain | Gelesen/verifiziert |
| --- | --- | --- | --- | --- |
| EMS work mode | 30003 | uint16 | - | AUSSTEHEND |
| Max active power | 30010 | uint32 | 1000 (kW -> W) | AUSSTEHEND |
| Plant ESS SoC | 30014 | uint16 | 10 (-> % * 10) | AUSSTEHEND |
| ESS power | 30037 | int32 | 1000 (kW -> W) | AUSSTEHEND |
| Rated ESS charging power | 30068 | uint32 | 1000 | AUSSTEHEND |
| Rated ESS discharging power | 30070 | uint32 | 1000 | AUSSTEHEND |
| Remote EMS enable | 40029 | uint16 | - | AUSSTEHEND |
| Remote EMS control mode | 40031 | uint16 | - | AUSSTEHEND |
| ESS max charging limit | 40032 | uint32 | 1000 | AUSSTEHEND |
| ESS max discharging limit | 40034 | uint32 | 1000 | AUSSTEHEND |
| PV max power limit | 40036 | uint32 | 1000 | AUSSTEHEND |

Firmwarestand: AUSSTEHEND | Protokollversion: AUSSTEHEND |
Auto-Revert bei Kommunikationsverlust: AUSSTEHEND

## Fail-Safe-Analyse

Modbus-Writes **bleiben stehen**, wenn openHAB ausfaellt - und Sigenergy
kennt (Stand Protokoll V1.7) kein geraeteseitiges Auto-Revert wie das
SunSpec-`InOutWRte_RvrtTms`. Der Abschnitt "Interaction timeout" des
Protokolls beschreibt nur Request-Timing, kein Steuerungs-Fallback.

- Der Kern setzt die Steuerung in jedem 5-Minuten-Zyklus neu auf (Reset +
  aktuelles Fenster) - haengengebliebene Zustaende ueberleben keinen
  Zyklus, **solange openHAB laeuft**.
- Restrisiko bei openHAB-Ausfall im Fenster: die Anlage bleibt im
  kommandierten Zustand stehen. Bei aktiver Ladesperre laedt die Batterie
  nicht mehr (Komfortverlust); bei aktiver forcierter Entladung entlaedt
  sie mit dem zuletzt kommandierten Limit weiter, bis die Anlage an ihrer
  eigenen Entladeuntergrenze stoppt. Das MUSS dem Mitglied kommuniziert
  werden, solange Spike-Punkt 9 kein Auto-Revert nachweist.
- Zusaetzlich moeglich (bisher nicht umgesetzt): ein systemd-Timer am Pi,
  der `Remote EMS enable = 0` schreibt, wenn openHAB nicht laeuft.

## Bekannte Grenzen

- Die Netzwerksuche (Scan und Watchdog-Rediscover) erkennt eine SigenStor
  nur an einer Modbus-Antwort auf Slave 247 - eine Seriennummer ist auf
  Anlagenebene nicht lesbar. Stehen mehrere Modbus-TCP-Geraete mit Slave
  247 im selben Netz, muss die IP von Hand gepflegt werden.
- Gesteuert wird der gesamte Anlagenverbund (Slave 247), nicht einzelne
  Wechselrichter oder Batterietuerme.
- Die Registerkarte gilt fuer Protokoll V1.7; neuere Firmwarestaende im
  Spike gegenpruefen.

## Simulator (Tests ohne Anlage)

`tools/sim_sigenstor.py` stellt einen Modbus-TCP-Server mit den
Plant-Registern bereit (SoC 55%, Nennentladeleistung 8000 W) und
protokolliert jeden Schreibzugriff - damit laesst sich die komplette
Installation inklusive Steuerlogik gegen einen leeren openHAB testen
(nur Standardbibliothek, kein pip noetig):

    python3 tools/sim_sigenstor.py --port 5020

Im Assistenten dann als Adresse `127.0.0.1` angeben. Port 502 braucht
root; der Parameter `--port` erlaubt einen unprivilegierten Port, der dann
im Bridge-Thing einzutragen ist.
