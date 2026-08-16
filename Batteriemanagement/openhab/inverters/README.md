# Wechselrichter-Profile

Jedes Unterverzeichnis ist ein unterstuetzter Wechselrichter-Typ. Der
Assistent (`setup/00-wizard.sh`) listet automatisch auf, was hier liegt — ein
neuer Hersteller braucht **keine Aenderung an den Setup-Skripten**.

```
inverters/
  fronius/               <- Fronius GEN24 (Fronius-Binding, Batterie-Actions)
    profile.sh              Herstellerspezifische Werte
    adapter.js              Wechselrichter-Adapter (siehe unten)
    overview.yaml           Main-UI-Seiten
    rediscover.sh           Netzwerksuche fuer den Watchdog
  fronius-snapinverter/  <- Fronius Symo Hybrid (Modbus, SunSpec Model 124)
  sigenergy/             <- Sigenergy SigenStor (Modbus, proprietaere Register)
  deye/                  <- Deye Hybrid SG04LP3/SG05LP3 (Modbus RTU hinter
                            RS485-Gateway, proprietaere Register/TOU)
  victron/               <- Victron Energy (Modbus TCP am GX-Geraet,
                            ESS-Settings-Register)
```

## Aufbau: Kern + Adapter

Die gesamte Entscheidungslogik der Batteriesteuerung (Zeitfenster, Wolken,
Pause, Kapazitaetsschaetzung, Leistungsberechnung) liegt herstellerneutral in
`../control/core.js` und wird **nie kopiert**. Ein Profil liefert nur einen
duennen **Adapter** (`INVERTER_ADAPTER_SCRIPT`), den das Setup dem Kern im
selben Regel-Body voranstellt. Der Adapter definiert drei Pflichtfunktionen
und optional eine vierte:

| Funktion | Semantik | Rueckgabe |
| --- | --- | --- |
| `ibmReset()` | Wechselrichter sofort auf Werksverhalten. Laeuft bei Toggle=ON in jedem Zyklus (auch waehrend der Pause); muss idempotent sein. | `{ ok }` |
| `ibmPreventCharge(minutes)` | Batterieladen fuer `minutes` Minuten sperren. | `{ ok }` |
| `ibmForceDischarge(watts, minutes)` | Entladung mit ~`watts` fuer `minutes` Minuten erzwingen. `watts` ist vom Kern bereits validiert und begrenzt. | `{ ok, appliedW? }` |
| `ibmLimitCharge(watts, minutes)` | OPTIONAL. Ladeleistung fuer `minutes` Minuten auf ~`watts` begrenzen (nicht erzwingen - geladen wird weiter nur aus PV). Fehlt die Funktion, bildet die Laderegelung des Kerns die Begrenzung per PWM ueber `ibmPreventCharge` nach (gesperrte/freie 15-Minuten-Bloecke). NICHT ueber Kommandos implementieren, die aus dem Netz laden koennten. | `{ ok, appliedW? }` |

`appliedW` ist die nach herstellerseitiger Quantisierung tatsaechlich
kommandierte Leistung (z. B. Prozent-Rundung) - der Kapazitaetsschaetzer des
Kerns rechnet damit.

Regeln fuer Adapter:

* **Fail-Safe-Pflicht:** Jede Aktion muss nach `minutes` Minuten von selbst
  ablaufen (Schedule wie beim GEN24, Revert-Timeout wie bei SunSpec 124).
  Kann der Hersteller das nicht, dokumentiert das Profil-README das
  Restrisiko ausdruecklich.
* Kein `rules.JSRule(...)`, kein Top-Level-`return` - der Adapter ist ein
  reiner Skriptkoerper vor dem Kern.
* Nur `@IBM_...@`-Platzhalter verwenden (ersetzt von
  `setup/04-install-rules.sh`), keine Thing-UID-Literale.
* Niemals werfen: Fehler fangen, loggen und `{ ok: false }` zurueckgeben.
* Alle Logausgaben mit `[IBM]` praefixieren.
* Nur auf die openhab-js-Globals verlassen (`items`, `actions`, `time`,
  `Quantity`, `console`), nicht auf Helfer des Kerns.

Drei Vorlagen:

* **Thing-Actions eines Bindings** (GEN24): `fronius/adapter.js` - drei
  Wrapper um die Batterie-Actions, ~60 Zeilen.
* **SunSpec Model 124 per Modbus** (jeder Hersteller mit beschreibbarem
  Storage-Model): `fronius-snapinverter/adapter.js` kopieren und nur die
  Registerkarte im Profil sowie die Geraetekonstanten anpassen.
* **Proprietaere Modbus-Register** (Kostal, Huawei, Sungrow, ...):
  `sigenergy/` als Muster - eigene Data-Thing-Map im Profil
  (`inverter_things_json`) + eigener Adapter nach demselben Kontrakt.
  `victron/` folgt demselben Muster (GX-Geraet, ESS-Settings-Register)
  und zeigt zusaetzlich gemerkte Werkswerte via `INVERTER_PERSIST_ITEMS`.

## Einen neuen Hersteller ergaenzen

1. Verzeichnis anlegen, z. B. `inverters/kostal/`.
2. `profile.sh` mit diesen Variablen anlegen:

   | Variable | Bedeutung |
   | --- | --- |
   | `INVERTER_LABEL` | Anzeigename im Assistenten |
   | `INVERTER_BINDINGS` | Addon-IDs fuer `addons.cfg` (Kategorie `binding`), Leerzeichen-getrennt; `INVERTER_BINDING` (ein Addon) geht auch |
   | `INVERTER_THING_PREFIX` | Praefix, unter dem bestehende Things erkannt werden, z. B. `kostal:plenticore` |
   | `INVERTER_SOC_CHANNEL` | Channel mit dem Batterie-Ladestand (klassischer Weg) |
   | `INVERTER_ADAPTER_SCRIPT` | Pfad zum Adapter, relativ zu `openhab/` |
   | `INVERTER_SOC_PLACEHOLDER` | Standardname des Ladestands-Items; wird vom Setup durch das konfigurierte Item ersetzt |
   | `INVERTER_NOTES` | Hinweis fuer den Installateur |

   Optional, fuer die Karte "Entladeleistung der Batterie" auf der
   Overview-Seite (ohne diese Variablen entfaellt die Abfrage im
   Assistenten und die Ersetzung beim Installieren der Seiten):

   | Variable | Bedeutung |
   | --- | --- |
   | `INVERTER_BATTERY_POWER_CHANNEL` | Channel mit der aktuellen Batterieleistung (+ entladen, - laden) |
   | `INVERTER_BATTERY_POWER_PLACEHOLDER` | Itemname in den Main-UI-Seiten, den das Setup durch `BATTERY_POWER_ITEM` ersetzt |
   | `INVERTER_GRID_POWER_CHANNEL` | Channel mit der aktuellen Netzleistung (+ Bezug, - Einspeisung); zusammen mit der Batterieleistung berechnet `control/netzeinspeisung.js` daraus `IBM_BATTERIE_NETZEINSPEISUNG` (Karte "Netzeinspeisung aus der Batterie" - bisher nur im fronius-Profil) |
   | `INVERTER_GRID_POWER_PLACEHOLDER` | Standard-Itemname der Netzleistung; wird durch `GRID_POWER_ITEM` ersetzt |
   | `INVERTER_PV_POWER_CHANNEL` | Channel mit der aktuellen PV-Leistung (Erzeugung); der Status-Push meldet sie an das Vorstands-Dashboard (Kachel "PV-Leistung") |
   | `INVERTER_PV_POWER_PLACEHOLDER` | Standard-Itemname der PV-Leistung; wird durch `PV_POWER_ITEM` ersetzt |

   Optional, fuer den Netzwerk-Watchdog (ohne diese Variablen bietet das
   Setup keinen Watchdog an):

   | Variable | Bedeutung |
   | --- | --- |
   | `INVERTER_HOST_THING_PREFIX` | Praefix des Things, das die Netzwerkadresse traegt (bei Fronius die Bridge: `fronius:bridge`; bei Modbus die tcp-Bridge: `modbus:tcp`) |
   | `INVERTER_HOST_PARAM` | Name des Konfigurationsparameters mit der Adresse (Vorgabe: `hostname`) |
   | `INVERTER_REDISCOVER_SCRIPT` | Pfad zur Netzwerksuche, relativ zu `openhab/` |

   Optional, fuer das automatische Anlegen der Things (02b):

   | Variable | Bedeutung |
   | --- | --- |
   | `INVERTER_AUTO_THING_UID` | UID des Haupt-Things beim automatischen Anlegen (Vorgabe `<prefix>:ibm:inverter1`). Muss das Segment `:ibm:` enthalten - daran erkennt 03-install-items.sh die automatische Einrichtung. |
   | `INVERTER_DEFAULT_USERNAME`, `INVERTER_USER_PARAM`, `INVERTER_PASSWORD_PARAM` | Zugangsdaten-Abfrage und deren Parameternamen im Bridge-Thing; leer = keine Abfrage |
   | `INVERTER_THING_EXTRA_CONFIG` | Zusaetzliche Konfiguration des Wechselrichter-Things (JSON-Objektinhalt, klassischer Zwei-Thing-Baum) |
   | `INVERTER_PERSIST_ITEMS` | Profil-Items (Leerzeichen-getrennt), die 03-install-items.sh zusaetzlich in mapdb.persist aufnimmt (everyChange + restoreOnStartup) - fuer Werte, die einen Neustart ueberleben muessen, z. B. bei der Installation gemerkte Werkswerte (siehe `victron/`) |

3. Optionale **Profilfunktionen** (Bash), wenn der Standard nicht reicht:

   | Funktion | Bedeutung |
   | --- | --- |
   | `inverter_scan_hosts()` | Netzsuche fuer den Assistenten, eine IP je Zeile |
   | `inverter_things_json()` | Geordnetes JSON-Array der anzulegenden Things `[{"UID","thingTypeUID","bridgeUID"?,"label","configuration"},...]` - noetig, sobald der Thing-Baum vom klassischen Muster "eine Bridge + ein Thing" abweicht (z. B. Modbus: tcp -> Poller -> Data-Things). Anlegereihenfolge = Arrayreihenfolge; `purge-ibm.sh` loescht in umgekehrter Reihenfolge. Muss auch mit leerem `INVERTER_HOST` ein gueltiges Array liefern (fuer den Purge). |
   | `inverter_battery_items()` | `.items`-Zeilen der Batterie- und Steuer-Items (automatische Einrichtung) - noetig, wenn die Messwerte an verschiedenen Things haengen oder der Adapter Schreib-Items braucht. Itemnamen stehen in der zweiten Spalte; 01-preflight.sh prueft sie auf Kollisionen. |
   | `inverter_verify()` | Zusaetzliche Pruefungen fuer `06-verify.sh` (Things ONLINE, Werte plausibel); Rueckgabe != 0 zaehlt als Problem |

4. Adapter schreiben (siehe oben) - **nicht** den Kern kopieren.

5. Alle Logausgaben mit `[IBM]` praefixieren.

6. Optional eine Netzwerksuche schreiben (Bash), die den Wechselrichter nach
   einem DHCP-IP-Wechsel wiederfindet - siehe `fronius/rediscover.sh` als
   Muster. Das Setup ersetzt darin diese Platzhalter:

   | Platzhalter | Wert |
   | --- | --- |
   | `@IBM_HOST_THING_UID@` | UID des Things mit der Netzwerkadresse |
   | `@IBM_HOST_PARAM@` | Name des Adress-Parameters |
   | `@IBM_TOKEN_FILE@` | Datei mit dem openHAB-API-Token |
   | `@IBM_STATE_DIR@` | Arbeitsverzeichnis (Lock, gemerkte Seriennummer) |
   | `@IBM_COOLDOWN_MIN@` | Mindestabstand zwischen zwei Suchen in Minuten |

   Vertrag: Das Skript wird bei Thing-`OFFLINE` und zusaetzlich alle
   15 Minuten aufgerufen, prueft Status, Abkuehlzeit und Geraeteidentitaet
   selbst, ist bei `ONLINE` still und traegt eine gefundene neue Adresse per
   REST API in das Thing ein. Logausgaben mit `[IBM][Watchdog]` praefixieren.

Diese Items stellt das Setup bereit; Kern und Adapter koennen sie
voraussetzen:

| Item | Typ | Bedeutung |
| --- | --- | --- |
| `Schalte_ISCHLSTROM_Empfehlung_einaus` | Switch | Hauptschalter |
| `Ischlstrom_Wolkenvorschau` | Number | Bewoelkung 0-100 % |
| `Ischlstrom_Crossover_Start` | String | Beginn Ueberschussfenster, `HH:MM:SS` |
| `Ischlstrom_Crossover_Ende` | String | Ende Ueberschussfenster, `HH:MM:SS` |
| `Ischlstrom_Ladesperre_Start` / `_Ende` | String | Ladesperre-Fenster, `HH:MM` oder `-` |
| `Ischlstrom_Ladesperre_Datum` | String | Gueltigkeitstag des Fensters, `YYYY-MM-DD` |
| `Ischlstrom_Ladesperre_Individuell` | Switch | ON = Ende kam individualisiert von der Token-API; der Kern uebernimmt es unveraendert |
| `Ischlstrom_Wolken_Stunden` | String | Stuendliche Bewoelkung des restlichen Tages (JSON mit datum/zeit/stunden) oder `-` |
| `Ischlstrom_Ladefaktoren` | String | Stuendliche Ladefaktoren des Erzeugungsprofils samt Abend-Deadline (JSON, Token-API) oder `-` |
| `Ischlstrom_Nachtbudget` | String | Nacht-Entladebudget in kWh (Token-API) oder `-`; der Kern entlaedt nur bis Abend-Ladestand minus Budget |
| `Ischlstrom_Nachtbudget_Zeit` | String | Abrufzeitpunkt des Budgets (Aktualitaetspruefung) |
| `IBM_HAUSLAST` | Number | Vom Kern gelernte Hauslast in W (Anzeige/Status-Push) |
| `IBM_HAUSLAST_MESSUNG` | String | Interner Zustand der Hauslastschaetzung (JSON) |
| `IBM_NACHT_ZIEL` | String | Interner Zustand: festgehaltener Ziel-Ladestand der laufenden Nacht (JSON) |
| `IBM_BATTERIE_NETZEINSPEISUNG` | Number | Berechnet (ibm_netzeinspeisung.js): Anteil der Batterie-Entladung, der ins Netz fliesst, in W; NULL ohne Batterie-/Netzleistungs-Item |
| `IBM_MIN_BATTERY_CHARGE` | Number | Minimaler Ladestand in % |
| `Minimale_Entladeleistung_Batterieeinspeisung` | Number | Watt |
| `Maximale_Entladeleistung_Batterieeinspeisung` | Number | Watt |
| `IBM_LADESPERRE_AKTIV` | Switch | Teilfunktion Ladesperre ein/aus |
| `IBM_LADESPERRE_WOLKEN_SCHWELLE` | Number | Bewoelkung in % |
| `IBM_LADESPERRE_LOKAL` | Switch | Sperr-Ende selbst berechnen (aus Kapazitaet und gelernter Ladeleistung) statt Server-Ende |
| `IBM_LADELEISTUNG` | Number | Vom Kern gelernte Ladeleistung in kW (Anzeige) |
| `IBM_LADERATE_MESSUNG` | String | Interner Zustand der Ladeleistungsschaetzung (JSON) |
| `IBM_LADESPERRE_LOKAL_ENDE` | String | Vom Kern berechnetes Sperr-Ende `HH:MM` oder `-` (Anzeige/Status-Push) |
| `IBM_LADEREGELUNG` | Switch | Ladeleistung dynamisch regeln (ersetzt das Sperrfenster, sobald die Schaetzungen belastbar sind) |
| `IBM_LADEREGELUNG_SOLL` | String | Ziel-Ladeleistung der Regelung, `<watt> W` oder `-` (Anzeige/Status-Push) |
| `IBM_LADEREGELUNG_STATUS` | String | Interner PWM-Zustand der Laderegelung (JSON) |
| `IBM_RESTLADEZEIT` | String | Effektive (sonnengewichtete) Restladezeit bis zur Abend-Deadline, `<stunden> h` oder `-` (Anzeige/Status-Push) |
| `IBM_ENTLADUNG_AKTIV` | Switch | Teilfunktion Entladung ein/aus |
| `IBM_PAUSE_TAGE` | Number | Verbleibende Pausentage: solange > 0 plant der Kern nichts |

Aeltere bzw. externe Profile mit einem eigenstaendigen Steuerungsskript
(`INVERTER_CONTROL_SCRIPT` statt `INVERTER_ADAPTER_SCRIPT`) funktionieren
weiter (Legacy-Modus); neue Profile sollen den Adapter-Weg gehen. Achtung im
Legacy-Modus: Thing-UIDs auch dort nur ueber `@IBM_THING_UID@` referenzieren -
die fruehere automatische Ersetzung von Praefix-Literalen gibt es nicht mehr.

## Grundsatz: konfigurieren statt kopieren

Ein Adapter wird **pro Kunde nicht veraendert**. Unterscheidet sich eine
Anlage, gehoert der Unterschied in ein Item oder eine Profilvariable - nicht
in eine Kopie des Skripts. Der Kern zeigt das Muster: alle Zeitfenster,
Schwellwerte und Teilfunktionen kommen aus Items, jeweils mit einem
Rueckfallwert im Code, falls ein Item fehlt oder auf `NULL` steht.

Neue Items dafuer werden an vier Stellen ergaenzt:
`setup/03-install-items.sh` (Definition und Persistence),
`setup/04-install-rules.sh` (Startwert in `ibm_init.js`),
`setup/01-preflight.sh` (Kollisionspruefung) und `setup/ibm.conf.example`.
