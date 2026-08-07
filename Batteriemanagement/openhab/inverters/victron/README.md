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
**nicht am Geraet verifiziert**. Werkzeug: `mbpoll` oder ein kurzes
pymodbus-Skript im LAN der Anlage; zum Testen ohne Anlage siehe
`tools/sim_venus.py`.

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
| Seriennummer GX | 800 | String[6] | - | AUSSTEHEND |
| Batterieleistung | 842 | int16 | 1 (+ laden) | AUSSTEHEND |
| Ladestand | 843 | uint16 | 1 | AUSSTEHEND |
| ESS grid setpoint | 2700 | int16 | 1 | AUSSTEHEND |
| DVCC MaxChargeCurrent | 2705 | int16 | 1 (-1 = unbegrenzt) | AUSSTEHEND |
| ESS MaxFeedInPower | 2706 | int16 | 0.01 (-1 = unbegrenzt) | AUSSTEHEND |
| DC-PV-Ueberschuss einspeisen | 2707 | uint16 | - | AUSSTEHEND |
| AC-PV-Ueberschuss NICHT einspeisen | 2708 | uint16 | - | AUSSTEHEND |
| BatteryLife state | 2900 | uint16 | - (9 = geladen halten) | AUSSTEHEND |
| ESS Minimum SoC | 2901 | uint16 | 10 | AUSSTEHEND |
| ESS Mode (Hub4Mode) | 2902 | uint16 | - (1/2 = ESS, 3 = extern) | AUSSTEHEND |

Venus-OS-Version: AUSSTEHEND | GX-Modell: AUSSTEHEND |
DVCC-Ladesperre wirkt auch auf MPPT: AUSSTEHEND |
Setpoint 2700 wirksam (trotz 3.50+-Override): AUSSTEHEND

## Fail-Safe-Analyse

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
- Zusaetzlich moeglich (bisher nicht umgesetzt): ein systemd-Timer am Pi,
  der die Werkswerte schreibt, wenn openHAB nicht laeuft.

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
