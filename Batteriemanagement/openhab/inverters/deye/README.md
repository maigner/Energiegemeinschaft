# Deye Hybrid (SG04LP3/SG05LP3, Modbus)

Profil fuer die 3-phasigen Deye-Niedervolt-Hybride (SUN-5K..20K-SG04LP3-EU
und SG05LP3-EU, baugleich u. a. als Sunsynk vertrieben; getestet werden soll
zuerst ein SUN-20K-SG05LP3-EU). Gesteuert wird ueber **Modbus RTU hinter
einem RS485-Ethernet-Gateway** und den **Time-of-Use-Verkaufsfahrplan
(TOU)** der proprietaeren Deye-Registerkarte - kein SunSpec:

| IBM-Aktion | Umsetzung |
| --- | --- |
| Reset (Werksverhalten) | `Time of Use enable (146) = 0` - die Anlage folgt wieder ihrem Grundmodus (Eigenverbrauch) |
| Ladesperre | TOU an + alle 6 Slot-Leistungen (154-159) = 0 + Netzladen-Flags (172-177) = 0 |
| Laderegelung | KEIN `ibmLimitCharge` - ein Ladestrom-Limit-Register ist nicht verifiziert, und laufend nachgefuehrte Limits wuerden EEPROM-Schreibzyklen kosten; der Kern nutzt die PWM ueber die Ladesperre (15-Minuten-Bloecke, EEPROM-schonend) |
| Forcierte Entladung | TOU an + Slot-Leistungen in Watt + Slot-Ziel-SoC (166-171) auf der Entladeuntergrenze |
| Fail-Safe | KEIN geraeteseitiges Auto-Revert bekannt - siehe Fail-Safe-Analyse |

Der Adapter beschreibt alle 6 Slots **identisch** - die Slot-Zeitgrenzen
(148-153) bleiben unangetastet und sind damit egal: jede Uhrzeit faellt in
irgendeinen Slot mit denselben Werten.

Besonderheiten gegenueber den anderen Modbus-Profilen:

- **Kein Modbus TCP im Geraet.** Die LP3-Hybride sprechen nur Modbus RTU
  ueber RS485. Der Solarman-WLAN-Stick kapselt das in ein proprietaeres
  Protokoll (Port 8899), das das openHAB-Modbus-Binding nicht versteht.
  Noetig ist ein RS485-Ethernet-Gateway (z. B. Waveshare "RS485 TO ETH")
  im Modus **"Modbus TCP <-> RTU"**, Port 502, seriell **9600 8N1**,
  Slave-ID 1. Die IP der Modbus-Bridge ist die des **Gateways**.
- Deye adressiert **literal und 0-basiert** (Registeradresse 588 = Adresse
  588 im Request), gelesen wird per **FC03** (Holding-Register),
  geschrieben mit FC06/FC16.
- Leistungen werden **direkt in Watt** geschrieben - `appliedW` ist bis
  auf die Quantisierung (`DEYE_POWER_STEP_W`, EEPROM-Schonung) exakt.
- **TOU ist geteilte Konfiguration:** dieselben Register bedient auch das
  Display bzw. die Solarman-App. IBM ueberschreibt die Slot-Werte
  (Leistung/SoC/Flags) dauerhaft - die Anlage darf deshalb keinen eigenen
  TOU-Zeitplan des Mitglieds fahren (vor der Installation am Display
  fotografieren, siehe Spike-Punkt 10).
- **Einstellregister liegen mutmasslich in Flash (EEPROM).** Der Adapter
  schreibt deshalb nur bei Wertaenderung und quantisiert die Leistung;
  die Schreiblast-Bewertung ist Spike-Punkt 7.

Quelle der Registerkarte: Community-Registerkarten der 3-phasigen
Niedervolt-Familie (kbialek/deye-inverter-mqtt, StephanJoubert/
home_assistant_solarman `deye_sg04lp3.yaml`, githubDante/deye-controller).
Die offizielle Deye-Modbus-Doku ist nicht frei verfuegbar; Firmwarestaende
weichen ab - alles im Spike pruefen.

## Voraussetzungen an der Anlage

1. **RS485-Ethernet-Gateway** an den RS485-Klemmen des Wechselrichters
   (Belegung A/B laut Deye-Handbuch des jeweiligen Modells; NICHT der
   BMS-RS485-Port der Batterie). Gateway-Modus "Modbus TCP Server <-> RTU
   Master", Port 502, 9600 8N1. Dem Gateway im Router eine feste
   IP-Reservierung geben.
2. **Grundmodus Eigenverbrauch ohne eigenen TOU-Zeitplan** - IBM
   ueberschreibt die Slot-Werte dauerhaft.
3. **Einspeisen erlaubt:** Work Mode **"Selling first"** (142 = 0) und
   **"Solar Sell"** aktiv - sonst deckt die forcierte Entladung nur den
   Hausverbrauch statt ins Netz zu speisen. Der Adapter aendert beide
   Einstellungen nicht, er warnt nur im Log.

## Spike: Registerkarte am Geraet verifizieren (VOR der ersten Installation)

Die Adressen in `profile.sh` und die Konstanten in `adapter.js` folgen den
Community-Registerkarten, sind aber noch **nicht am Geraet verifiziert**.
Werkzeug: `mbpoll` oder ein kurzes pymodbus-Skript im LAN der Anlage; zum
Testen ohne Anlage siehe `tools/sim_deye.py`.

Checkliste (Ergebnis in die Tabelle unten eintragen, danach `profile.sh`/
`adapter.js` anpassen):

1. Gateway verdrahten und konfigurieren (RS485-Klemmen laut Handbuch,
   9600 8N1, Modus Modbus TCP, Port 502); Wechselrichter-Modell,
   Firmwarestand (Display -> Geraeteinfo) und Gateway-Typ dokumentieren.
2. Adressierung und Function Codes bestaetigen: FC03 auf Adresse 142 an
   Slave 1 muss den Work Mode liefern (0-2, gegen die Display-Anzeige
   pruefen). Antwortet nichts: Slave-ID am Display pruefen
   (`MODBUS_UNIT_ID`), 1-basierte Adressierung (141 statt 142) testen.
3. Reads verifizieren: Batterie-SoC (588, Erwartung: Rohwert = %, gegen
   das Display pruefen -> `MODBUS_SOC_GAIN`), Batterieleistung (590,
   **Vorzeichen**: bei Entladung positiv? -> `MODBUS_BATT_POWER_GAIN`),
   Max sell power (143, Rohwert = W oder W*10?), Solar Sell (145),
   TOU enable (146) und die Slot-Register 148-177 gegen die
   TOU-Seite am Display.
4. TOU-enable-Semantik (146) klaeren: reines 0/1 oder Tages-Bitmaske
   (dann z. B. 255 = alle Tage)? -> `DEYE_TOU_ON` in `adapter.js`.
5. Ladesperre testen: TOU an + alle Slot-Leistungen 0 + Flags 0.
   Pruefen: Batterie laedt NICHT (auch bei PV-Ueberschuss), Batterie
   entlaedt nicht, PV versorgt Haushalt und Netz normal weiter. Falls die
   Batterie trotzdem laedt: Alternative `BatteryMaxChargeCurrent
   (108) = 0` testen und den Adapter entsprechend umbauen (dann muss der
   Originalwert von 108 gemerkt und beim Reset zurueckgeschrieben werden).
6. Forcierte Entladung testen: TOU an + Slot-Leistung x W + Ziel-SoC 10 %.
   AC-Leistung gegen Display/Zaehler messen (Erwartung: Registerwert = W;
   entlaedt die Anlage zusaetzlich zum Hausverbrauch ins Netz?).
   Voraussetzungen gegenpruefen: Verhalten bei Work Mode != Selling first
   und bei Solar Sell = 0. Verhalten bei Leistung > Max sell power
   dokumentieren (Fehlercode oder stilles Klemmen?).
7. **Persistenz/EEPROM:** ueberleben per Modbus geschriebene Werte einen
   Neustart des Wechselrichters (dann Flash-gestuetzt)? Der Kern toggelt
   Register 146 innerhalb der Fenster zweimal je 5-Minuten-Zyklus
   (Reset + Fensterbefehl, ca. 200 Schreibzugriffe je Entladenacht) -
   Schreiblast bewerten und beim Installateur/Deye die Zyklenfestigkeit
   erfragen. Falls kritisch: Haertung unten umsetzen.
8. **Fail-Safe (Go/No-Go):** TOU mit aktiver Entladung stehen lassen und
   den Modbus-Master trennen (openHAB stoppen). Faellt die Anlage nach
   einem Timeout von selbst in den Normalbetrieb zurueck? Ergebnis ->
   `DEYE_HAS_AUTO_REVERT` in `adapter.js` (nur Doku) und Abschnitt
   Fail-Safe-Analyse unten.
9. Koexistenz: haengt ein Solarman-Stick an der Anlage (App-Monitoring),
   pruefen, ob dessen Polling und die Gateway-Kommunikation sich stoeren
   (RS485-Buskonflikte, CRC-Fehler im Gateway-Log) und ob App-Schreibzugriffe
   IBM-Werte ueberschreiben.
10. Ausgangszustand sichern: vor dem ersten Schreibtest die TOU-Seite und
    die Batterie-Einstellungen am Display fotografieren und die gelesenen
    Registerwerte notieren - damit laesst sich der Originalzustand
    wiederherstellen.

### Registertabelle (im Spike ausfuellen)

| Register | Adresse | Typ | Gain | Gelesen/verifiziert |
| --- | --- | --- | --- | --- |
| Work Mode | 142 | uint16 | - | AUSSTEHEND |
| Max sell power | 143 | uint16 | 1 (W?) | AUSSTEHEND |
| Solar Sell | 145 | uint16 | - | AUSSTEHEND |
| Time of Use enable | 146 | uint16 | - | AUSSTEHEND |
| TOU Slot 1-6 Beginn | 148-153 | uint16 | HHMM | AUSSTEHEND |
| TOU Slot 1-6 Leistung | 154-159 | uint16 | 1 (W) | AUSSTEHEND |
| TOU Slot 1-6 Ziel-SoC | 166-171 | uint16 | 1 (%) | AUSSTEHEND |
| TOU Slot 1-6 Flags | 172-177 | uint16 | Bit 0 Netz, Bit 1 Gen | AUSSTEHEND |
| Batterie-SoC | 588 | uint16 | 1 (%) | AUSSTEHEND |
| Batterieleistung | 590 | int16 | 1 (W), Vorzeichen? | AUSSTEHEND |

Modell: AUSSTEHEND | Firmwarestand: AUSSTEHEND | Gateway: AUSSTEHEND |
Auto-Revert bei Kommunikationsverlust: AUSSTEHEND |
Registerwerte ueberleben Neustart (Flash): AUSSTEHEND

## Fail-Safe-Analyse

Modbus-Writes **bleiben stehen**, wenn openHAB ausfaellt - und Deye kennt
(Community-Stand) kein geraeteseitiges Auto-Revert wie das
SunSpec-`InOutWRte_RvrtTms`.

- Der Kern setzt die Steuerung in jedem 5-Minuten-Zyklus neu auf (Reset +
  aktuelles Fenster) - haengengebliebene Zustaende ueberleben keinen
  Zyklus, **solange openHAB laeuft**.
- Restrisiko bei openHAB-Ausfall im Fenster: die Anlage bleibt im
  TOU-Fahrplan stehen. Bei aktiver Ladesperre (Slot-Leistung 0) tut die
  Batterie dauerhaft nichts (Komfortverlust); bei aktiver forcierter
  Entladung entlaedt sie mit der zuletzt kommandierten Leistung weiter,
  bis der Slot-Ziel-SoC (`DEYE_SOC_FLOOR`, 10 %) bzw. die BMS-Untergrenze
  erreicht ist. Das MUSS dem Mitglied kommuniziert werden, solange
  Spike-Punkt 8 kein Auto-Revert nachweist.
- Anders als bei Sigenergy kann das Mitglied den Zustand **selbst am
  Display des Wechselrichters** beenden (TOU/Zeitplan abschalten) - kein
  Installateur-Zugang noetig. Ein Neustart des Pi genuegt ebenfalls: der
  Kern setzt im naechsten 5-Minuten-Zyklus zurueck.
- Zusaetzlich moeglich (bisher nicht umgesetzt): ein systemd-Timer am Pi,
  der `Time of Use enable = 0` schreibt, wenn openHAB nicht laeuft.

### Moegliche Haertung EEPROM (bisher nicht umgesetzt)

Faellt Spike-Punkt 7 kritisch aus (Register in Flash, geringe
Zyklenfestigkeit), laesst sich das Reset/Befehl-Toggle von Register 146
innerhalb der Fenster vermeiden: der Adapter kann in `ibmReset()` das
Abschalten ueberspringen, wenn unmittelbar danach im selben Zyklus ohnehin
ein Fensterbefehl folgt (dazu muesste er die Fenster-Items des Kerns
mitlesen - bewusst noch nicht gebaut, um keine doppelte Fensterlogik zu
pflegen).

## Bekannte Grenzen

- Die Netzwerksuche (Scan und Watchdog-Rediscover) findet das
  RS485-**Gateway** (Modbus-Antwort mit plausiblem Work Mode an Slave 1) -
  eine Seriennummer wird nicht geprueft. Stehen mehrere solche Gateways im
  selben Netz, muss die IP von Hand gepflegt werden. Am besten dem Gateway
  im Router eine feste IP-Reservierung geben.
- Laeuft das Gateway auf einem anderen Port als 502, funktionieren Scan
  und Rediscover nicht (sie proben fest Port 502 bzw. `MODBUS_PORT`);
  die Bridge selbst laesst sich ueber `MODBUS_PORT` in `ibm.conf`
  umstellen.
- Die Registerkarte gilt fuer die 3-phasige Niedervolt-Familie
  (SG04LP3/SG05LP3). Einphasige Deye (SG01/SG03/SG04LP1) haben eine
  KOMPLETT andere Registerkarte - dieses Profil passt dort nicht.
- IBM ueberschreibt die TOU-Slot-Werte dauerhaft; ein vom Mitglied
  gepflegter TOU-Zeitplan ist mit IBM nicht kombinierbar.

## Simulator (Tests ohne Anlage)

`tools/sim_deye.py` stellt einen Modbus-TCP-Server mit den Registern der
3-phasigen Niedervolt-Familie bereit (SoC 55 %, Work Mode Selling first,
TOU aus) und protokolliert jeden Schreibzugriff - damit laesst sich die
komplette Installation inklusive Steuerlogik gegen einen leeren openHAB
testen (nur Standardbibliothek, kein pip noetig):

    python3 tools/sim_deye.py --port 5020

Im Assistenten dann als Adresse `127.0.0.1` angeben. Port 502 braucht
root; der Parameter `--port` erlaubt einen unprivilegierten Port, der dann
im Bridge-Thing einzutragen ist (oder vorab `MODBUS_PORT` in `ibm.conf`).
