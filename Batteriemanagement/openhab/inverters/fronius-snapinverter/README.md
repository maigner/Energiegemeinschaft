# Fronius Symo Hybrid (SnapINverter, Modbus)

Profil fuer die aeltere Fronius-Hybrid-Generation (Symo Hybrid mit
Datamanager 2.0, z. B. mit BYD Battery-Box HV). Die GEN24-Config-API gibt es
dort nicht - die Batterie-Actions des openHAB-Fronius-Bindings (Profil
`fronius`) funktionieren nicht. Gesteuert wird stattdessen ueber **Modbus
TCP** und das **SunSpec Basic Storage Control Model (124)**:

| IBM-Aktion | Umsetzung |
| --- | --- |
| Reset (Werksverhalten) | `StorCtl_Mod = 0`, `InWRte = 100 %`, `OutWRte = 100 %` |
| Ladesperre | `InWRte = 0` + Charge-Limit-Bit in `StorCtl_Mod` |
| Laderegelung (ibmLimitCharge) | `InWRte = Prozent von WChaMax` + Charge-Limit-Bit - das Storage-Model ist genau dafuer gebaut, samt Auto-Revert (`InOutWRte_RvrtTms`) |
| Forcierte Entladung | negatives `InWRte` (Prozent von `WChaMax`) + Charge-Limit-Bit |
| Fail-Safe | `InOutWRte_RvrtTms` = Fensterlaenge + 60 s vor jedem Steuer-Write |

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
   Registeradressen, das Profil geht fest von int + SF aus

Ausserdem: Die Batterie kann im **Energiesparmodus** bis zu 10 Minuten
brauchen, bis sie auf Kommandos reagiert. IBM kommandiert alle 5 Minuten
neu; ein verzoegerter Anlauf der Entladung am Abend ist deshalb normal und
kein Fehler.

## Spike: Registerkarte am Geraet verifizieren (VOR der ersten Installation)

Die Adressen in `profile.sh` und die Konstanten in `adapter.js` folgen der
Fronius-Registerkarte (int + SF) und der SunSpec-Spezifikation, sind aber
noch **nicht am Geraet verifiziert**. Werkzeug: `mbpoll` oder ein kurzes
pymodbus-Skript im LAN der Anlage; zum Testen ohne Anlage siehe
`tools/sim_datamanager.py`.

Checkliste (Ergebnis in die Tabelle unten eintragen, danach `profile.sh`/
`adapter.js` anpassen):

1. SunSpec-Kette ab Register 40001 abgehen ("SunS"-Kennung), Basisadresse
   von Model 124 notieren; Datamanager-Firmwarestand dokumentieren.
   Erwartung: Model-ID 124 an Adresse 40313 (0-basiert).
2. `ChaState` (+8) und `ChaState_SF` (+22) lesen, gegen den SoC der
   Solar API (`GetPowerFlowRealtimeData.fcgi`) pruefen -> `MODBUS_SOC_GAIN`.
3. `WChaMax` (+2) und `WChaMax_SF` (+18) lesen -> `M124_WCHAMAX_W_PER_UNIT`.
4. `InWRte` (+13), `OutWRte` (+12), `InOutWRte_SF` (+25), `StorCtl_Mod` (+5),
   `MinRsvPct` (+7) lesen -> `M124_WRTE_RAW_PER_PCT`.
5. Ladesperre testen: `InWRte = 0` + Bit 0 in `StorCtl_Mod`; per Solar API
   pruefen, dass das PV-Laden stoppt. Ruecksetzen testen.
6. Forcierte Entladung testen: negatives `InWRte`; Vorzeichenkonvention und
   benoetigte Bits festhalten, Prozent-zu-AC-Watt-Verhaeltnis messen.
7. **`InOutWRte_RvrtTms` (+15)**: Wert (z. B. 360) schreiben, Read-back
   pruefen und verifizieren, dass die Steuerung nach Ablauf OHNE weitere
   Writes zurueckfaellt -> `M124_HAS_RVRTTMS`. Das ist die Go/No-Go-Frage
   fuer den primaeren Fail-Safe (siehe unten).
8. Model 160 (MPPT): ist die Batterielade-/entladeleistung lesbar? Wenn ja,
   kann das Profil spaeter den Wert "Batterie laedt/entlaedt" in der
   Hero-Karte der Overview nachruesten (Data-Thing +
   `INVERTER_BATTERY_POWER_PLACEHOLDER`, Block `batterie-stat` aus
   `fronius/overview.yaml`).
9. Unit-IDs enumerieren: welche antwortet fuer den Hybrid (Model 124
   vorhanden), welche fuer einen Nicht-Hybrid-Slave -> `MODBUS_UNIT_ID`.
10. Energiesparmodus: Aufwachlatenz bei einem Entladebefehl messen; wird der
    Befehl gehalten oder muss er wiederholt werden?

### Registertabelle (im Spike ausfuellen)

| Punkt | Offset | Adresse (0-basiert) | Typ | SF | Gelesen/verifiziert |
| --- | --- | --- | --- | --- | --- |
| ID (= 124) | +0 | 40313 (erwartet) | uint16 | - | AUSSTEHEND |
| WChaMax | +2 | | uint16 | WChaMax_SF (+18) | AUSSTEHEND |
| StorCtl_Mod | +5 | | uint16 (Bitfeld) | - | AUSSTEHEND |
| MinRsvPct | +7 | | uint16 | +21 | AUSSTEHEND |
| ChaState (SoC) | +8 | | uint16 | ChaState_SF (+22) | AUSSTEHEND |
| OutWRte | +12 | | int16 | InOutWRte_SF (+25) | AUSSTEHEND |
| InWRte | +13 | | int16 | InOutWRte_SF (+25) | AUSSTEHEND |
| InOutWRte_RvrtTms | +15 | | uint16 | - | AUSSTEHEND |

Firmwarestand Datamanager: AUSSTEHEND | Unit-ID Hybrid: AUSSTEHEND |
RvrtTms unterstuetzt: AUSSTEHEND

## Fail-Safe-Analyse

Die GEN24-Schedules laufen von selbst ab - faellt openHAB aus, kehrt der
Wechselrichter binnen 5 Minuten zum Werksverhalten zurueck. Modbus-Writes
dagegen **bleiben stehen**. Deshalb:

- Primaer: `InOutWRte_RvrtTms` wird vor jedem Steuer-Write auf
  Fensterlaenge + 60 s gesetzt - der Wechselrichter setzt sich selbst
  zurueck (setzt `M124_HAS_RVRTTMS = true` voraus, Spike-Punkt 7).
- Unterstuetzt das Geraet den Timeout nicht (`M124_HAS_RVRTTMS = false`),
  bleibt als Restrisiko: faellt openHAB waehrend einer forcierten Entladung
  aus, entlaedt die Batterie mit der zuletzt kommandierten Leistung weiter,
  bis der Wechselrichter selbst bei seiner Entladeuntergrenze stoppt. Das
  MUSS dem Mitglied kommuniziert werden; zusaetzlich moeglich: ein
  systemd-Timer am Pi, der `StorCtl_Mod = 0` schreibt, wenn openHAB nicht
  laeuft (bisher nicht umgesetzt).
- Unabhaengig davon setzt der Kern die Steuerung in jedem 5-Minuten-Zyklus
  neu auf (Reset + aktuelles Fenster) - haengengebliebene Zustaende
  ueberleben also keinen Zyklus, solange openHAB laeuft.

## Bekannte Grenzen

- Die Hero-Karte der Overview zeigt nur den Ladestand (keine
  Batterieleistung), bis Spike-Punkt 8 (Model 160) geklaert ist.
- Beim manuellen Weg (ohne automatisches Anlegen) muessen die Modbus-Things
  von Hand angelegt werden; das Setup erwartet dann ein SoC-Item am
  `number`-Channel eines Data-Things. Empfohlen ist durchgehend die
  automatische Einrichtung.
- Die Registeradressen gelten fuer die int+SF-Karte des Datamanagers 2.0.
  Andere Firmwarestaende: Spike wiederholen.

## Simulator (Tests ohne Anlage)

`tools/sim_datamanager.py` stellt einen Modbus-TCP-Server mit dem
Model-124-Block bereit (SoC 55%, WChaMax 5000 W) und protokolliert jeden
Schreibzugriff - damit laesst sich die komplette Installation inklusive
Steuerlogik gegen einen leeren openHAB testen (nur Standardbibliothek,
kein pip noetig):

    python3 tools/sim_datamanager.py --port 5020

Im Assistenten dann als Adresse `127.0.0.1` angeben und im Profil
`MODBUS_M124_BASE` unveraendert lassen (der Simulator bedient dieselben
Adressen). Port 502 braucht root; der Parameter `--port` erlaubt einen
unprivilegierten Port, der dann im Bridge-Thing einzutragen ist.
