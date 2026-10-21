# Victron Energy (GX-Geraet, Modbus)

Profil fuer Victron-Batterieanlagen (MultiPlus/Quattro mit DC-PV am MPPT
oder AC-PV, immer mit GX-Geraet: Cerbo GX, Venus GX, ...). Gesteuert wird
ueber **Modbus TCP auf dem GX-Geraet** und die **Settings-Register der
ESS-Regelung** - eine offiziell dokumentierte Registerkarte
(github.com/victronenergy/dbus_modbustcp, attributes.csv) auf Systemebene
(Unit-ID 100), kein SunSpec. Die Anlage bleibt dabei in ihrem normalen
ESS-Modus:

| IBM-Aktion | Umsetzung |
| --- | --- |
| Reset (Werksverhalten) | Gemerkte Werkswerte zurueckschreiben: `grid setpoint (2700)` und `DVCC MaxChargeCurrent (2705)` |
| Ladesperre | `DVCC MaxChargeCurrent (2705) = 0` - begrenzt den Ladestrom systemweit (Multi und MPPT) |
| Laderegelung (ibmLimitCharge) | `DVCC MaxChargeCurrent (2705) = Watt / VIC_BATTERY_VOLTAGE_V` - die Umrechnung nutzt die nominelle Batteriespannung (Konstante im Adapter, Vorgabe 50 V fuer 48-V-Systeme); Ungenauigkeit regelt der Kern ueber den Live-Ladestand aus |
| Forcierte Entladung | `grid setpoint (2700) = -Watt` - negativ heisst Einspeisung ins Netz |
| Fail-Safe | KEIN geraeteseitiges Auto-Revert der Settings-Register - aber der ESS-Minimum-SoC wirkt als harter Boden (siehe Fail-Safe-Analyse) |

Besonderheiten gegenueber den anderen Profilen:

- Der grid setpoint wirkt am **NETZPUNKT**, nicht an der Batterie: bei
  `-2000` speist die Anlage 2000 W ins Netz, die Batterie liefert
  zusaetzlich den Haushalt. `appliedW` ist der kommandierte Netz-Export
  (exakt, keine Prozent-Quantisierung). Der Kapazitaetsschaetzer des Kerns
  rechnet mit `appliedW` und unterschaetzt die Kapazitaet deshalb um den
  Haushaltsanteil - der Fehler geht in die sichere Richtung (weniger
  Entladeleistung).
- **BEWUSST KEIN ESS Mode 3** (External Control, vebus-Register 37/38/39):
  dessen 60-Sekunden-Watchdog schaltet den Multi bei Kommunikationsverlust
  dauerhaft in **Passthru** - die Batterie taete nichts mehr, bis jemand
  eingreift. Fuer IBM ist das schlechter als das Restrisiko des
  Settings-Wegs.
- Beim Ruecksetzen werden die **bei der Installation gemerkten Werkswerte**
  geschrieben (Items `IBM_VIC_ResetSetpointW` / `IBM_VIC_ResetMaxChargeA`,
  befuellt von `inverter_verify()` in 06-verify.sh, gesichert ueber
  mapdb/`INVERTER_PERSIST_ITEMS`). Fehlen sie, gelten die Rueckfallwerte
  des Adapters: Setpoint 50 W (Victron-Vorgabe), MaxChargeCurrent -1
  (unbegrenzt). Hat die Anlage abweichende Einstellungen, die Items nach
  einer Aenderung an der Anlage neu befuellen (06-verify.sh erneut laufen
  lassen oder die Items in der Karaf-Konsole setzen).
- Victron adressiert **literal** (Adresse 843 = Adresse 843 im Request),
  alles Halteregister: Lesen FC03, Schreiben FC06/FC16.
- Die **GX-Seriennummer ist per Modbus lesbar** (Register 800) - der
  Watchdog prueft damit die Geraeteidentitaet, anders als bei Sigenergy.

Quelle der Registerkarte: dbus_modbustcp attributes.csv (Stand 2026-08);
Grid-setpoint-Verhalten lt. ESS-Handbuch und "ESS mode 2 and 3"-Doku.

## Voraussetzungen an der Anlage

In der GX Remote Console (bzw. VRM):

1. **ESS-Assistent** konfiguriert, Modus **"Optimiert"** (mit oder ohne
   BatteryLife) - nicht "Batterien geladen halten", nicht "Externe
   Steuerung"
2. **Settings -> Services -> Modbus TCP** aktivieren (Port 502)
3. Einspeisung zulaessig: die ESS-Einspeise-Einstellungen und ein etwaiges
   Einspeiselimit (`MaxFeedInPower`) duerfen die forcierte Entladung nicht
   blockieren

Die Steuerung laeuft auf **Systemebene** (Unit-ID 100): kommandiert wird
die ESS-Regelung des GX, nicht ein einzelner Multi - bei Parallel- oder
Dreiphasen-Systemen also der gesamte Verbund.

## Spike: Verhalten am Geraet verifizieren (VOR der ersten Installation)

Die Adressen in `profile.sh` stammen aus der offiziellen Registerliste,
das VERHALTEN (Setpoint-Regelung, DVCC-Wirkung auf MPPTs) ist aber noch
**nicht am Geraet verifiziert**. Werkzeug: `tools/spike_venus.py` (nur
Standardbibliothek, laeuft am Laptop im LAN der Anlage oder auf dem Pi;
Schritte `reads`, `watch`, `setpoint`, `prevent`, `limit`, `discharge`,
`failsafe`, `reset`, Zuordnung zur Checkliste im Docstring). `reads` merkt
Setpoint und DVCC-Limit als Werkswerte in `spike_venus.state.json`, jeder
steuernde Schritt setzt darauf zurueck (auch bei Ctrl+C/Fehler), nur
`failsafe` laesst das Kommando absichtlich stehen. Zum Testen ohne Anlage
siehe `tools/sim_venus.py`:

    python3 tools/sim_venus.py --port 5020 &
    python3 tools/spike_venus.py 127.0.0.1 --port 5020 --yes reads setpoint prevent discharge

Checkliste (Ergebnis in die Tabelle unten eintragen, danach `profile.sh`/
`adapter.js` anpassen):

1. Remote Console: Modbus TCP aktivieren; Venus-OS-Version, ESS-Modus und
   Einspeise-Einstellungen (DC-/AC-PV-Ueberschuss, Einspeiselimit)
   dokumentieren.
2. Reads an Unit 100 verifizieren: Seriennummer (800, 12 ASCII-Zeichen),
   `SoC` (843, Erwartung: Rohwert = %, gegen Remote Console pruefen),
   `Batterieleistung` (842, Vorzeichen: > 0 = laden ->
   `MODBUS_BATTERY_POWER_GAIN`), `ESS Mode` (2902, Erwartung 1 oder 2),
   `Minimum SoC` (2901, Rohwert = % * 10).
3. Grid setpoint (2700) lesen: entspricht der Wert der Remote-Console-
   Einstellung (Vorgabe 50 W)? Danach einen unkritischen Wert schreiben
   (z. B. 100) und pruefen, dass die Remote Console ihn uebernimmt und
   die Regelung ihm folgt; Original zuruecksetzen.
4. **Venus 3.50+:** pruefen, ob Schreiben auf 2700 die Regelung weiterhin
   steuert (die Doku empfiehlt dort das neue Override-Register 2716/2717,
   int32). Falls 2700 wirkungslos ist: Profil auf 2716 umstellen
   (Data-Thing `int32`, Poller-Laenge anpassen) und hier dokumentieren -
   dabei auch klaeren, ob das Override bei GX-Neustart oder von selbst
   zurueckfaellt (waere ein ECHTES Auto-Revert und gehoert in die
   Fail-Safe-Analyse).
5. Ladesperre testen: `2705 = 0` schreiben. Pruefen: Batterie laedt NICHT
   (auch bei PV-Ueberschuss), PV versorgt Haushalt und Netz weiter,
   Batterie darf fuer den Haushalt weiter entladen. Danach `2705 = -1`.
   Fuer die Laderegelung zusaetzlich einen Zwischenwert testen (z. B.
   `2705 = 10`): die Ladeleistung soll sich auf etwa Strom x
   Batteriespannung einpendeln. Die tatsaechliche Batteriespannung
   dokumentieren und `VIC_BATTERY_VOLTAGE_V` im Adapter anpassen
   (12/24-V-Systeme!).
6. **DVCC vs. MPPT (Go/No-Go fuer die Ladesperre):** laut Victron-Doku
   gilt das DVCC-Ladestromlimit NICHT fuer die Solarlader, wenn die Option
   "Feed-in excess solar charger power" (DC-PV-Ueberschuss einspeisen,
   Register 2707 = 1) aktiv ist. An der Anlage pruefen, ob die Batterie
   bei `2705 = 0` trotzdem laedt. Falls ja: Alternative testen -
   `/Hub4/DisableCharge` (vebus-Register 38, Unit-ID des Multi laut
   GX-Modbus-Serviceliste; nicht persistent, faellt bei GX-Neustart
   zurueck) - und das Profil um ein vebus-Data-Thing ergaenzen.
7. Forcierte Entladung testen: `2700 = -x` schreiben; Netz-Export gegen
   Remote Console/Zaehler messen (Erwartung: Export = x, Batterie liefert
   x + Haushalt). Verhalten bei x ueber der Wechselrichter-Nennleistung
   dokumentieren (Erwartung: stilles Klemmen auf das Anlagenmaximum).
   Auch pruefen, dass ein Einspeiselimit (`MaxFeedInPower`, 2706) bzw.
   "AC-PV-Ueberschuss nicht einspeisen" (2708) den Batterie-Export nicht
   verhindert.
8. Minimum SoC pruefen: Entladung unter den ESS-Minimum-SoC kommandieren -
   Erwartung: die Anlage stoppt am Minimum von selbst (harter Boden).
9. **Fail-Safe:** forcierte Entladung aktiv lassen und den Modbus-Master
   trennen (openHAB stoppen). Erwartung: der Setpoint BLEIBT stehen
   (Settings-Register, kein Auto-Revert), die Entladung stoppt erst am
   Minimum SoC. Ergebnis in die Fail-Safe-Analyse unten eintragen.
10. Dauerverhalten: zyklisches Schreiben derselben Werte alle 5 Minuten
    (ibmReset in jedem Zyklus) - pruefen, dass das GX identische Writes
    nicht als Aenderung persistiert (Flash-Schonung; dbus-Settings
    schreiben nur bei Wertaenderung).

### Registertabelle (im Spike ausfuellen)

| Register | Adresse | Typ | Gain | Gelesen/verifiziert |
| --- | --- | --- | --- | --- |
| Seriennummer GX | 800 | String[6] | - | OK (12 ASCII-Zeichen, pi-031) |
| AC-PV am Ausgang L1..L3 | 808..810 | uint16 | 1 | gelesen: 0 (pi-031 hat keine AC-PV am Ausgang) |
| AC-PV am Eingang L1..L3 | 811..813 | uint16 | 1 | OK (pi-031: 384/120/116 W = Summe der pvinverter-Services 20+21) |
| Grid L1..L3 (System) | 817..819 | int16 | 1 | **UNBRAUCHBAR auf 2.84** (steigen bei Einspeisung, L3 klemmt bei 0) - nicht verwenden |
| DC-PV (MPPT) | 826 | uint16 | 1 | gelesen: 1 (keine MPPTs) |
| Netzzaehler L1..L3 | 2600..2602 an der Unit des grid-Services (pi-031: 30) | int16 | 1 (+ Bezug, - Einspeisung) | OK - folgt dem Setpoint exakt (-600 -> Summe -590..-620) |
| Batterieleistung | 842 | int16 | 1 (+ laden) | OK (+ laden, - entladen, gegen 844 bestaetigt) |
| Ladestand | 843 | uint16 | 1 | OK (21 = 21 %) |
| ESS grid setpoint | 2700 | int16 | 1 | OK - Regelung folgt am Netzzaehler (Summe aller Phasen), +800/-600/-1000 getestet |
| DVCC MaxChargeCurrent | 2705 | int16 | 1 (-1 = unbegrenzt) | OK - 0 A: Ladung 320 -> ~45 W Rest; 3 A: ~3,3 A |
| ESS MaxFeedInPower | 2706 | int16 | 0.01 (-1 = unbegrenzt) | gelesen: 0 bei ausgeschaltetem "Systemeinspeisung begrenzen" (Wert dann ohne Wirkung, nicht -1!) |
| DC-PV-Ueberschuss einspeisen | 2707 | uint16 | - | gelesen: 0 |
| AC-PV-Ueberschuss NICHT einspeisen | 2708 | uint16 | - | gelesen: 0 |
| BatteryLife state | 2900 | uint16 | - (9 = geladen halten) | gelesen: 10 = Optimiert ohne BatteryLife |
| ESS Minimum SoC | 2901 | uint16 | 10 | OK (50 = 5,0 %) |
| ESS Mode (Hub4Mode) | 2902 | uint16 | - (1/2 = ESS, 3 = extern) | gelesen: 1 |

Venus-OS-Version: 2.84 | GX-Modell: Cerbo GX |
DVCC-Ladesperre wirkt auch auf MPPT: NICHT PRUEFBAR (Anlage hat keine MPPTs,
nur AC-PV) | Setpoint 2700 wirksam: JA (2716/2717 auf 2.84 nicht vorhanden)

### Spike-Protokoll 2026-10-21 (pi-031, Cerbo GX, Venus OS 2.84)

Anlage: MultiPlus einphasig (Unit 227) an einer Phase, 48-V-Batterie ohne
CAN-BMS (kein battery-Service), keine MPPTs, zwei AC-PV-Wechselrichter am
AC-Eingang (Units 20 dreiphasig ~350 W, 21 einphasig ~270 W),
dreiphasiger Netzzaehler (grid-Service Unit 30). ESS "Optimiert" ohne
BatteryLife, Minimum SoC 5 %, "Systemeinspeisung begrenzen" aus.
Werkzeug: `tools/spike_venus.py`, Hauptschalter am Pi OFF.

| Punkt | Ergebnis |
| --- | --- |
| 2 Reads | alle Register plausibel (Tabelle oben) |
| 3/4 Setpoint | 2700 = 100 / 800 / -600 / -1000 geschrieben, Read-back sofort; die ESS-Regelung zieht die **Summe des Netzzaehlers** auf den Sollwert (-600 -> Zaehler -590...-620 W binnen 20 s). Kein Override-Register auf 2.84 |
| 5 Laderegelung | 2705 = 3 A -> Ladestrom 3,2-3,5 A (170-215 W bei 52,7 V); 2705 = 0 -> Ladung von 320 W in 30 s auf ~45 W Rest (0,8 A) - fuer die Ladesperre ausreichend, aber nicht exakt null |
| 6 DVCC vs. MPPT | entfaellt (keine MPPTs); bei AC-PV genuegt 2705 |
| 7 Entladung | 2700 = -1000: Batterie -790 W, Netzzaehler-Export entsprechend (Haushalt lief ueber AC-PV); -600 -> Export 600 W am Zaehler |
| 8 Minimum SoC | OFFEN (21 % -> 5 % haette Stunden gedauert) |
| 9 Fail-Safe | **KEIN Auto-Revert bestaetigt**: -600 W stehen gelassen, 150 s ohne Modbus-Verbindung -> Setpoint weiter -600, Zaehler -510...-670 W, Batterie -370...-400 W. `reset` stellte 50 W / -1 A wieder her |
| 10 Flash | nicht geprueft |

Befund fuer das Profil: die System-Register 817..819 ("Grid L1..L3") sind
auf Venus 2.84 **unbrauchbar** - sie steigen bei Einspeisung sogar an (L3
klemmt bei 0, L1 zeigt den Betrag). Der echte Netzzaehler liefert
korrekte, vorzeichenrichtige Werte am grid-Service (hier Unit 30,
Register 2600..2602, int16 W je Phase); AC-PV 811..813 stimmt mit den
pvinverter-Services ueberein.

### Netz- und PV-Leistung (seit 2026-10-21)

- **PV** = `Group:Number:SUM IBM_VIC_PvPower` ueber sieben Register des
  System-Services: AC-PV am Ausgang 808..810, AC-PV am Eingang 811..813,
  DC-PV (MPPT) 826 (Poller `vicpv`, 808..826 am Stueck lesbar). Fehlende
  Quellen liefern 0.
- **Netz** = `Group:Number:SUM IBM_VIC_GridPower` ueber die drei Phasen des
  Netzzaehler-Services (2600..2602, + Bezug / - Einspeisung = IBM-
  Konvention). Der Service hat eine **eigene Unit-ID** (Modbus/TCP-Seite
  der Remote Console listet sie; pi-031: 30), das Binding kennt die Unit-ID
  nur an der tcp-Bridge - deshalb eine zweite Bridge `modbus:tcp:ibmgrid`
  auf dieselbe Adresse. Die Unit-ID sucht `__ibm_vic_grid_unit()` einmalig
  am Geraet (FC03 auf 2600 an Unit 1..99) und merkt sie als
  `VIC_GRID_UNIT_ID` in ibm.conf; ohne Netzzaehler bleibt die Gruppe leer
  und der Status-Push meldet null. Der Netzwerk-Watchdog zieht die zweite
  Bridge bei einem IP-Wechsel mit (`INVERTER_EXTRA_HOST_THINGS`).
- Damit rechnet der Kern Netzladung, Hausvorrang und "Einspeisung aus der
  Batterie" (Regel `ibm_netzeinspeisung`), und das Dashboard zeigt PV und
  Netz.

## Fail-Safe-Analyse

> Profiluebergreifend: Fehlerbilder, die geplante Absicherung am Pi
> (Deadman-Timer, Boot-Reset, Hardware-Watchdog) und der Stand je Profil
> stehen in [../failsafe-modbus.md](../failsafe-modbus.md).

Die Settings-Register **bleiben stehen**, wenn openHAB ausfaellt - Victron
kennt fuer diesen Steuerweg kein geraeteseitiges Auto-Revert wie das
SunSpec-`InOutWRte_RvrtTms`. (ESS Mode 3 haette einen 60-s-Watchdog, endet
bei Ausfall aber in dauerhaftem Passthru - deshalb bewusst nicht genutzt,
siehe oben.)

- Der Kern setzt die Steuerung in jedem 5-Minuten-Zyklus neu auf (Reset +
  aktuelles Fenster) - haengengebliebene Zustaende ueberleben keinen
  Zyklus, **solange openHAB laeuft**.
- Restrisiko bei openHAB-Ausfall im Fenster: bei aktiver Ladesperre laedt
  die Batterie nicht mehr (Komfortverlust); bei aktiver forcierter
  Entladung speist die Anlage mit dem zuletzt kommandierten Setpoint
  weiter, **stoppt aber von selbst am ESS-Minimum-SoC** - die Batterie
  wird nie unter die konfigurierte Reserve entladen. Das ist ein harter,
  anlagenseitiger Boden, den z. B. das Deye-Profil nicht hat. Das
  Restrisiko MUSS dem Mitglied trotzdem kommuniziert werden.
- Der root-Timer `ibm-failsafe` (`setup/10-install-failsafe.sh`) uebernimmt
  das: `inverter_failsafe_reset()` in `profile.sh` ruft
  `tools/failsafe_reset.py` (seit 2026-10-21) - ein Skript ohne openHAB,
  das grid setpoint (2700) und MaxChargeCurrent (2705) auf die gemerkten
  Werkswerte schreibt und per Read-back prueft. Die Werkswerte liegen dafuer
  zusaetzlich zu den Items in `ibm.conf` (`VIC_RESET_SETPOINT_W`,
  `VIC_RESET_MAX_CHARGE_A`, geschrieben von `inverter_verify()`; fehlen sie,
  gelten 50 W / -1 A). Guard: Seriennummer lesbar, ESS-Modus 1/2 (Modus 3 =
  Externe Steuerung -> nichts schreiben, Exit 2), Ladestand plausibel.
  `--scan` sucht das GX bei unerreichbarer Adresse in allen lokalen Netzen
  und nimmt bei mehreren Kandidaten nur das mit der vom Watchdog gemerkten
  Seriennummer (`STATE_DIR/serial`). Am Geraet pi-031 bestaetigt (direkt
  und per Scan); der Timer-Geraetetest (openHAB-Stop, Boot) steht noch aus.

## Bekannte Grenzen

- Der Kapazitaetsschaetzer rechnet mit dem Netz-Export (`appliedW`) statt
  der echten Batterieleistung und unterschaetzt die Kapazitaet um den
  Haushaltsanteil waehrend der Entladung - sicher, aber konservativ.
- Die gemerkten Werkswerte (`IBM_VIC_Reset*`) veralten, wenn der
  Installateur Setpoint oder DVCC-Limit spaeter aendert, waehrend IBM
  laeuft - dann die Items neu befuellen (siehe oben).
- Gesteuert wird die ESS-Regelung des GX (Unit 100), nicht einzelne
  Wechselrichter; bei mehreren GX-Geraeten im selben Netz entscheidet die
  gemerkte Seriennummer des Watchdogs.
- "Batterien geladen halten" und "Externe Steuerung" werden erkannt und
  fuehren zu `ok: false` statt zu einer wirkungslosen Steuerung.

## Simulator (Tests ohne Anlage)

`tools/sim_venus.py` stellt einen Modbus-TCP-Server mit den GX-Registern
bereit (Seriennummer SIMVENUS0001, SoC 55%, Setpoint 50 W, ESS-Modus 1)
und protokolliert jeden Schreibzugriff - damit laesst sich die komplette
Installation inklusive Steuerlogik gegen einen leeren openHAB testen
(nur Standardbibliothek, kein pip noetig):

    python3 tools/sim_venus.py --port 5020

Im Assistenten dann als Adresse `127.0.0.1` angeben. Port 502 braucht
root; der Parameter `--port` erlaubt einen unprivilegierten Port, der dann
im Bridge-Thing einzutragen ist.
