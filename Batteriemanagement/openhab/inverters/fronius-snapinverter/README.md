# Fronius Symo Hybrid (SnapINverter, Modbus)

Profil fuer die aeltere Fronius-Hybrid-Generation (Symo Hybrid mit
Datamanager 2.0, z. B. mit BYD Battery-Box HV). Die GEN24-Config-API gibt es
dort nicht - die Batterie-Actions des openHAB-Fronius-Bindings (Profil
`fronius`) funktionieren nicht. Gesteuert wird stattdessen ueber **Modbus
TCP** und das **SunSpec Basic Storage Control Model (124)**:

| IBM-Aktion | Umsetzung |
| --- | --- |
| Reset (Werksverhalten) | `StorCtl_Mod = 0`, `InWRte = 100 %`, `OutWRte = 100 %` |
| Ladesperre | `InWRte = 0` + `StorCtl_Mod = 1` (Fronius-Beispiel 2 "nur Entladen erlauben") |
| Laderegelung (ibmLimitCharge) | `InWRte = Prozent von WChaMax` + `StorCtl_Mod = 1` - das Storage-Model ist genau dafuer gebaut |
| Forcierte Entladung | Fenster `InWRte = -x %`, `OutWRte = +x %`, `StorCtl_Mod = 3` (Fronius-Beispiel 6 "Entladen mit x %") |
| Fail-Safe | KEIN geraeteseitiges Auto-Revert: `InOutWRte_RvrtTms` ist laut Registerkarte "Not supported" - siehe Fail-Safe-Analyse |

Quelle der Semantik: Fronius "Datamanager Modbus TCP & RTU" (42,0410,2049,
S. 45-48, in `docs/`): `InWRte`/`OutWRte` spannen ein Leistungsfenster in
Prozent von `WChaMax` auf, negativ = Ladung, positiv = Entladung; alle
Vorgaben sind Empfehlungen, von denen der Wechselrichter aus Gruenden der
Betriebssicherheit abweichen darf.

Ein separater Nicht-Hybrid-Wechselrichter an derselben Anlage (z. B. ein
Symo als Slave) stoert nicht: gesteuert wird nur der Hybrid, und der Adapter
weigert sich zu schreiben, solange an der Basisadresse nicht Model-ID 124
und ein plausibles `WChaMax` gelesen werden.

## Voraussetzungen am Datamanager

Weboberflaeche des Datamanagers -> Einstellungen -> Modbus:

1. Modbus TCP aktivieren, Port 502
2. **"Wechselrichter-Steuerung ueber Modbus" aktivieren** - ohne das werfen
   Schreibzugriffe auf Model 123/124 eine Modbus-Exception
3. SunSpec Model Type **"int + SF"** - die float-Karte verschiebt alle
   Registeradressen (Model 124 dann ab 40313 statt 40303), das Profil geht
   fest von int + SF aus
4. Optional "Steuerung einschraenken" auf die IP des Pi - dann nimmt der
   Datamanager Steuerbefehle nur von dort an
5. Modbus-Geraete-ID = **Wechselrichter-Nummer** am Display (00 wird zu
   100); bei Master/Slave im Solar Net hat jeder Wechselrichter seine
   eigene Nummer, Model 124 liefert nur der Hybrid (`MODBUS_UNIT_ID`)

Not-Aus von Hand: "Datenausgabe ueber Modbus" auf "aus" setzt alle per
Modbus uebertragenen Steuerbefehle zurueck (Datamanager-2.0-Anleitung
S. 73).

Ausserdem: Die Batterie kann im **Energiesparmodus** bis zu 10 Minuten
brauchen, bis sie auf Kommandos reagiert. IBM kommandiert alle 5 Minuten
neu; ein verzoegerter Anlauf der Entladung am Abend ist deshalb normal und
kein Fehler.

## Spike: Registerkarte am Geraet verifizieren (VOR der ersten Installation)

Die Adressen in `profile.sh` und die Konstanten in `adapter.js` folgen der
offiziellen Fronius-Registerkarte 1.1.5-1 (int + SF) und der Modbus-
Anleitung 42,0410,2049 (beides in `docs/`, Desk-Check 2026-09-10 siehe
unten), sind aber noch **nicht am Geraet verifiziert**.

Werkzeug: `tools/spike_datamanager.py` arbeitet die Punkte 1-10 direkt
gegen den Datamanager ab (nur Standardbibliothek, laeuft am Laptop wie am
Pi) - read-only per `chain`/`units`/`reads`/`watch`, steuernd per
`prevent`/`discharge`/`discharge-inonly`/`revert`/`failsafe` (mit
Bestaetigung, Sicherheits-Reset bei Ctrl+C), Aufraeumen per `reset`; die
SoC- und Leistungs-Gegenprobe holt es aus der Solar API desselben Hosts.
Alles landet in `spike_datamanager.log`. Zum Testen ohne Anlage:

    python3 tools/sim_datamanager.py --port 5020 &
    python3 tools/spike_datamanager.py 127.0.0.1 --port 5020 --no-api --yes chain units reads prevent discharge revert reset

Checkliste (Ergebnis in die Tabelle unten eintragen, danach `profile.sh`/
`adapter.js` anpassen; Schritt des Spike-Skripts in Klammern):

1. (`chain`) SunSpec-Kette ab Adresse 40000 abgehen ("SunS"-Kennung),
   Basisadresse von Model 124 notieren; Datamanager-Firmwarestand (Common
   Block `Vr`) dokumentieren. Erwartung laut Modbus-Anleitung S. 47 und
   Registerkarte: Model-ID 124 an Adresse **40303** (0-basiert) bei
   int+SF; 40313 heisst, der Datamanager steht auf float. Taucht ein
   Inverter-Model 111-113 auf, ebenfalls float.
2. (`reads`) `ChaState` (+8) und `ChaState_SF` (+22) lesen, gegen den SoC
   der Solar API (`GetStorageRealtimeData.cgi`, `StateOfCharge_Relative`)
   pruefen -> `MODBUS_SOC_GAIN` (Erwartung SF -2 -> 0.01).
3. (`reads`) `WChaMax` (+2) und `WChaMax_SF` (+18) lesen ->
   `M124_WCHAMAX_W_PER_UNIT` (Erwartung SF 0 -> 1). Laut Anleitung S. 45
   ist `WChaMax = max(MaxChaRte, MaxDisChaRte)` und 0 ohne Speicher.
4. (`reads`) `InWRte` (+13), `OutWRte` (+12), `InOutWRte_SF` (+25),
   `StorCtl_Mod` (+5), `MinRsvPct` (+7), `ChaSt` (+11), `ChaGriSet` (+17)
   lesen -> `M124_WRTE_RAW_PER_PCT` (Erwartung SF -2 -> 100).
5. (`prevent`) Ladesperre wie Fronius-Beispiel 2: `InWRte = 0`,
   `StorCtl_Mod = 1`; per Solar API (`P_Akku` nicht negativ) pruefen, dass
   das PV-Laden stoppt und die Entladung fuer den Haushalt weiter geht.
   Ruecksetzen testen (`reset`).
6. (`discharge`, `discharge-inonly`) Forcierte Entladung wie Beispiel 6:
   `InWRte = -x %`, `OutWRte = +x %`, `StorCtl_Mod = 3`; `ChaSt` muss auf
   DISCHARGING gehen, `P_Akku` ~ +x % von `WChaMax` (gegen Solar.web/
   Zaehler messen). Gegenprobe `discharge-inonly` (nur `InWRte`, Bit 0):
   wirkt das allein? Ergebnis -> `ibmForceDischarge` in `adapter.js`.
7. (`revert`) **`InOutWRte_RvrtTms` (+15)**: Registerkarte sagt "Not
   supported", nur lesbar - Erwartung: Write wird mit Exception abgewiesen
   oder nicht gehalten, `M124_HAS_RVRTTMS = false` bleibt. Wird der Wert
   wider Erwarten gehalten UND faellt eine Ladesperre danach von selbst,
   `M124_HAS_RVRTTMS = true` setzen und `rvrttms` im Profil wieder
   beschreibbar machen. (`failsafe`) Zusaetzlich das Stehenbleiben ohne
   Master einmal beobachten, damit das Restrisiko belegt ist.
8. (`chain`) Model 160 (MPPT): laut Registerkarte hat es auf dem Symo
   Hybrid genau zwei Module "String 1"/"String 2" - die Batterieleistung
   ist dort NICHT enthalten (Erwartung bestaetigen). Fuer den Wert
   "Batterie laedt/entlaedt" in der Hero-Karte der Overview bleibt
   `P_Akku` aus `GetPowerFlowRealtimeData.fcgi` der Solar API (> 0 =
   Entladung) oder `ChaSt` (+11) als reiner Status.
9. (`units`) Unit-IDs enumerieren: Geraete-ID = Wechselrichter-Nummer am
   Display (Anleitung S. 16); welche hat Model 124 mit `WChaMax > 0`
   (Hybrid), welche ist der Nicht-Hybrid-Slave -> `MODBUS_UNIT_ID`.
10. (`discharge`, Zeit mitlesen) Energiesparmodus: Aufwachlatenz bei einem
    Entladebefehl messen (bis 10 min laut Anleitung); wird der Befehl
    gehalten oder muss er wiederholt werden? Laut Anleitung S. 47 weckt
    auch ein `MinRsvPct` ueber dem letzten SoC die Batterie aus dem
    Standby - als Hebel notieren, falls die Latenz stoert.

### Handbuecher (`docs/`)

Offizielle Unterlagen, Stand 2026-09-10 (die PDFs kommen direkt von
`fronius.com/~/downloads/...`, Dokumentnummer im Dateinamen):

| Datei | Inhalt |
| --- | --- |
| `docs/fronius-datamanager-modbus-tcp-rtu-42-0410-2049-v033-2026-02-24.pdf` | Datamanager Modbus TCP & RTU (DE/EN, 104 S.) - das massgebliche Dokument: Modbus-Einstellungen inkl. "Wechselrichter-Steuerung ueber Modbus" (S. 28-30), Geraete-IDs (S. 16-17), Antwortzeiten (S. 15), **Basic Storage Control Model 124 mit Beispielen** (S. 45-48) |
| `docs/fronius-datamanager-2.0-bedienungsanleitung-42-0426-0191-DE-v032-2026-02-24.pdf` | Datamanager 2.0 Bedienungsanleitung (96 S.); Einstellungen - Modbus S. 73-75 |
| `docs/fronius-energy-package-symo-hybrid-bedienungsanleitung-42-0426-0222-DE-v027-2024-10-16.pdf` | Bedienungsanleitung Symo Hybrid 3.0/4.0/5.0-3-S ("Fronius Energy Package", 148 S.); Betriebszustaende der Batterie inkl. Energiesparmodus S. 25-26, Modbus-Einstellungen S. 101-102, technische Daten 5.0-3-S S. 139-140 |
| `docs/fronius-solar-api-v1-42-0410-2012-EN-v021-2025-05-15.pdf` | Solar API V1 (91 S.) - `GetStorageRealtimeData` (S. 53 ff., `StateOfCharge_Relative`) und `GetPowerFlowRealtimeData` (S. 64 ff.) fuer die SoC-Gegenprobe in Spike-Punkt 2 |
| `docs/fronius-symo-hybrid-mit-fremdbatterie-installationsanleitung-42-0426-0303-DE.pdf` | Installationsanleitung Symo Hybrid mit Fremdbatterie (Checkbox 500V, z. B. BYD; 20 S.) |
| `docs/registerkarten/` | Fronius-Paket "Modbus Register - SunSpec Maps, State Codes and Events" **Version 1.1.5-1** (`_INFO.TXT`, `_CHANGELOG.TXT`): `Inverter_Register_Map_Int&SF_v1.0_with_SYMOHYBRID_MODEL_124.xlsx` (Blatt "IC124 Basic Storage Control" und "Complete Map"), die Float-Variante zum Vergleich, `Symo_State_Codes.csv`. Quelle: Spiegelung des offiziellen Zips in github.com/grawlinson/fronius-docs, da der Fronius-Download hinter einem Kontaktformular liegt |

Nicht gefunden: eine offizielle Installationsanleitung des Symo Hybrid /
Energy Package als direkter Download (dort stuende, wie die
Wechselrichter-Nummer am Display gesetzt wird, die zur Modbus-Geraete-ID
wird); bei Bedarf ueber manuals.fronius.com nachschlagen.

#### Desk-Check gegen die offiziellen Unterlagen (2026-09-10)

Abgleich von `profile.sh`/`adapter.js` mit der Modbus-Anleitung v033 und
der Registerkarte 1.1.5-1. Die drei Abweichungen sind **in Profil,
Adapter und Simulator uebernommen**, aber noch nicht am Geraet
verifiziert - der Spike bestaetigt sie:

- **Basisadresse.** Modbus-Anleitung S. 47: Startadresse des Basic Storage
  Control Registers ist **40303 bei int+SF**, 40313 bei float. Das Profil
  stand auf der Float-Adresse (dort laege bei int+SF `InBatV`, der Adapter
  haette korrekt jeden Write verweigert). `MODBUS_M124_BASE` ist jetzt
  40303; der Simulator legt das Modell dorthin (`--float` fuer 40313).
- **`InOutWRte_RvrtTms` ist nicht unterstuetzt.** Registerkarte IC124,
  Offset 16 (1-basiert): "R, Not supported" - ebenso `InOutWRte_WinTms`
  und `InOutWRte_RmpTms`. `M124_HAS_RVRTTMS` steht jetzt auf `false`, das
  Register wird im Profil nur noch gelesen; der Fail-Safe ist der
  zyklische Reset durch den Kern (Restrisiko siehe Fail-Safe-Analyse).
  Spike-Punkt 7 kann das nur noch widerlegen.
- **Forcierte Entladung mit beiden Bits.** Beispiel 6 der Modbus-Anleitung
  (S. 46-47, "Entladen mit 50 % der nominalen Leistung"): `InWRte = -50 %`,
  `OutWRte = 50 %`, `StorCtl_Mod = 3`. `ibmForceDischarge` schreibt jetzt
  genau dieses Fenster (vorher nur negatives `InWRte` mit Bit 0); die
  Ladesperre entsprach schon Beispiel 2 (`InWRte = 0`, `StorCtl_Mod = 1`).
  Spike-Punkt 6 misst beide Varianten.
- **Skalierungen passen zur Registerkarte:** `WchaMax_SF = 0`
  (`M124_WCHAMAX_W_PER_UNIT = 1`), `InOutWRte_SF = -2`
  (`M124_WRTE_RAW_PER_PCT = 100`), `ChaState_SF = -2`
  (`MODBUS_SOC_GAIN = 0.01`), `MinRsvPct_SF = -2`. Blocklaenge L = 24
  Register plus ID und L = 26, wie im Poller.
- **Geraete-ID = Wechselrichter-Nummer** (Modbus-Anleitung S. 16): die am
  Display eingestellte Nummer ist die Modbus-Unit-ID, Nummer 00 wird zu
  ID 100. Bei Master/Slave im Solar Net antwortet also jeder Wechselrichter
  unter seiner eigenen ID ueber denselben Datamanager; Model 124 liefert
  nur der Hybrid (`WChaMax = 0` ohne Speicher, S. 45). `MODBUS_UNIT_ID = 1`
  ist eine Annahme - Spike-Punkt 9.
- **Antwortzeiten:** bei mehreren Geraeten im Solar Net Ring empfiehlt
  Fronius ein Timeout von mindestens 10 s und nur sequenzielle Abfragen
  (S. 15) - beim Bridge-Thing und im Spike-Skript beruecksichtigen.
- **Vorgaben sind Empfehlungen** (S. 45): der Wechselrichter darf aus
  Gruenden der Betriebssicherheit abweichen; Writes werden je nach
  Steuerungs-Prioritaet (EVU-Editor) eventuell nicht angenommen. Und:
  "Datenausgabe ueber Modbus" auf "aus" setzt alle Modbus-Steuerbefehle
  zurueck (Datamanager-2.0-Anleitung S. 73) - ein manueller Not-Reset.
- **Zusatzregister:** `ChaGriSet` (+17, 0-basiert) erlaubt/verbietet
  Netzladung, UND-verknuepft mit "Batterieladung aus EVU Netz erlauben" im
  EVU-Editor; `MinRsvPct` weckt die Batterie aus dem Standby, wenn er
  ueber den letzten SoC gesetzt wird (S. 47) - moeglicher Hebel gegen die
  Aufwachlatenz aus Spike-Punkt 10.

### Registertabelle (im Spike ausfuellen)

Erwartungen aus der Registerkarte 1.1.5-1 (int + SF), Adressen 0-basiert:

| Punkt | Offset | Adresse (erwartet) | Typ | SF (erwartet) | Gelesen/verifiziert |
| --- | --- | --- | --- | --- | --- |
| ID (= 124) | +0 | 40303 | uint16 | - | AUSSTEHEND |
| WChaMax | +2 | 40305 | uint16 | WChaMax_SF (+18) = 0 | AUSSTEHEND |
| StorCtl_Mod | +5 | 40308 | uint16 (Bitfeld: 1 InWRte, 2 OutWRte) | - | AUSSTEHEND |
| MinRsvPct | +7 | 40310 | uint16 | MinRsvPct_SF (+21) = -2 | AUSSTEHEND |
| ChaState (SoC) | +8 | 40311 | uint16 | ChaState_SF (+22) = -2 | AUSSTEHEND |
| ChaSt | +11 | 40314 | enum16 (1 OFF ... 7 TESTING) | - | AUSSTEHEND |
| OutWRte | +12 | 40315 | int16 | InOutWRte_SF (+25) = -2 | AUSSTEHEND |
| InWRte | +13 | 40316 | int16 | InOutWRte_SF (+25) = -2 | AUSSTEHEND |
| InOutWRte_RvrtTms | +15 | 40318 | uint16, laut Karte nur lesbar | - | AUSSTEHEND |
| ChaGriSet | +17 | 40320 | enum16 (0 PV, 1 GRID) | - | AUSSTEHEND |

Firmwarestand Datamanager: AUSSTEHEND | Unit-ID Hybrid: AUSSTEHEND |
Unit-ID Slave: AUSSTEHEND | RvrtTms unterstuetzt: AUSSTEHEND (Erwartung: nein) |
Entladung nur mit InWRte wirksam: AUSSTEHEND

## Fail-Safe-Analyse

Die GEN24-Schedules laufen von selbst ab - faellt openHAB aus, kehrt der
Wechselrichter binnen 5 Minuten zum Werksverhalten zurueck. Modbus-Writes
dagegen **bleiben stehen**, und der Datamanager kennt laut Registerkarte
kein Revert-Timeout (`InOutWRte_RvrtTms` "Not supported", nur lesbar).
Deshalb:

- Der Kern setzt die Steuerung in jedem 5-Minuten-Zyklus neu auf (Reset +
  aktuelles Fenster) - haengengebliebene Zustaende ueberleben keinen
  Zyklus, **solange openHAB laeuft**.
- Restrisiko bei openHAB-Ausfall im Fenster: bei aktiver Ladesperre laedt
  die Batterie nicht mehr (Komfortverlust); bei aktiver forcierter
  Entladung entlaedt sie mit der zuletzt kommandierten Leistung weiter,
  bis der Wechselrichter selbst an `MinRsvPct` bzw. seiner
  Entladeuntergrenze stoppt. Das MUSS dem Mitglied kommuniziert werden.
- Not-Aus von Hand: "Datenausgabe ueber Modbus" am Datamanager auf "aus"
  setzt alle Modbus-Steuerbefehle zurueck.
- Zusaetzlich moeglich (bisher nicht umgesetzt): ein systemd-Timer am Pi,
  der `StorCtl_Mod = 0` schreibt, wenn openHAB nicht laeuft.
- Sollte Spike-Punkt 7 wider Erwarten ein wirksames Revert-Timeout
  nachweisen: `M124_HAS_RVRTTMS = true` in `adapter.js`, `rvrttms` im
  Profil wieder beschreibbar - der Adapter setzt es dann vor jedem
  Steuer-Write auf Fensterlaenge + 60 s.

## Bekannte Grenzen

- Die Hero-Karte der Overview zeigt nur den Ladestand: die
  Batterieleistung ist laut Registerkarte per Modbus nicht lesbar (Model
  160 fuehrt nur die PV-Strings). Nachruestbar ueber `P_Akku` der Solar
  API (HTTP-Binding) - Spike-Punkt 8 bestaetigt die Registerkarte.
- Beim manuellen Weg (ohne automatisches Anlegen) muessen die Modbus-Things
  von Hand angelegt werden; das Setup erwartet dann ein SoC-Item am
  `number`-Channel eines Data-Things. Empfohlen ist durchgehend die
  automatische Einrichtung.
- Die Registeradressen gelten fuer die int+SF-Karte des Datamanagers 2.0
  (Registerkarte 1.1.5-1). Andere Firmwarestaende: Spike wiederholen.
- Bei mehreren Geraeten im Solar Net Ring empfiehlt Fronius mindestens
  10 s Timeout und nur sequenzielle Modbus-Abfragen (Anleitung S. 15);
  IBM pollt nur den einen Model-124-Block alle 10 s.

## Simulator (Tests ohne Anlage)

`tools/sim_datamanager.py` stellt einen Modbus-TCP-Server mit der
SunSpec-Modellkette der int+SF-Karte und dem Model-124-Block ab 40303
bereit (SoC 55%, WChaMax 5000 W), weist Writes auf nur lesbare Register
wie der echte Datamanager mit Exception 02 ab (`--lax` erlaubt sie),
antwortet nur unter der konfigurierten Unit-ID (`--unit`, Vorgabe 1) und
protokolliert jeden Schreibzugriff - damit laesst sich die komplette
Installation inklusive Steuerlogik gegen einen leeren openHAB testen
(nur Standardbibliothek, kein pip noetig):

    python3 tools/sim_datamanager.py --port 5020

`--float` legt das Modell wie die Float-Karte auf 40313, um den
Fehlerfall "Datamanager steht auf float" durchzuspielen. Im Assistenten
dann als Adresse `127.0.0.1` angeben und im Profil `MODBUS_M124_BASE`
unveraendert lassen. Port 502 braucht root; der Parameter `--port`
erlaubt einen unprivilegierten Port, der dann im Bridge-Thing
einzutragen ist.
