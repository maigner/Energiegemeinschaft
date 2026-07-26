# Wechselrichter-Profile

Jedes Unterverzeichnis ist ein unterstuetzter Wechselrichter-Hersteller. Der
Assistent (`setup/00-wizard.sh`) listet automatisch auf, was hier liegt — ein
neuer Hersteller braucht **keine Aenderung an den Setup-Skripten**.

```
inverters/
  fronius/
    profile.sh      <- Herstellerspezifische Werte
```

## Einen neuen Hersteller ergaenzen

1. Verzeichnis anlegen, z. B. `inverters/kostal/`.
2. `profile.sh` mit diesen Variablen anlegen:

   | Variable | Bedeutung |
   | --- | --- |
   | `INVERTER_LABEL` | Anzeigename im Assistenten |
   | `INVERTER_BINDING` | Addon-ID fuer `addons.cfg` (Kategorie `binding`) |
   | `INVERTER_THING_PREFIX` | Praefix der Thing-UID, z. B. `kostal:plenticore` |
   | `INVERTER_SOC_CHANNEL` | Channel mit dem Batterie-Ladestand |
   | `INVERTER_CONTROL_SCRIPT` | Pfad zum Steuerungsskript, relativ zu `openhab/` |
   | `INVERTER_SOC_PLACEHOLDER` | Itemname im Steuerungsskript, den das Setup ersetzt |
   | `INVERTER_NOTES` | Hinweis fuer den Installateur |

3. Steuerungsskript schreiben. Es ist ein reiner **Skriptkoerper** (wie in der
   Main UI unter "Script Action"), kein `rules.JSRule(...)` — das Setup
   verpackt es selbst und haengt den Cron-Trigger an.

   Das Skript darf zwei Dinge fest verdrahtet enthalten, weil das Setup sie
   ersetzt:
   * die Thing-UID (muss mit `INVERTER_THING_PREFIX` beginnen)
   * den Itemnamen aus `INVERTER_SOC_PLACEHOLDER`

   Diese Items werden vom Setup bereitgestellt und koennen vorausgesetzt
   werden:

   | Item | Typ | Bedeutung |
   | --- | --- | --- |
   | `Schalte_ISCHLSTROM_Empfehlung_einaus` | Switch | Hauptschalter |
   | `Ischlstrom_Wolkenvorschau` | Number | Bewoelkung 0-100 % |
   | `Ischlstrom_Crossover_Start` | String | Beginn Ueberschussfenster, `HH:MM:SS` |
   | `Ischlstrom_Crossover_Ende` | String | Ende Ueberschussfenster, `HH:MM:SS` |
   | `IBM_MIN_BATTERY_CHARGE` | Number | Minimaler Ladestand in % |
   | `Minimale_Entladeleistung_Batterieeinspeisung` | Number | Watt |
   | `Maximale_Entladeleistung_Batterieeinspeisung` | Number | Watt |
   | `IBM_LADESPERRE_AKTIV` | Switch | Teilfunktion Ladesperre ein/aus |
   | `IBM_LADESPERRE_START` / `_ENDE` | Number | Stunde 0-23 |
   | `IBM_LADESPERRE_WOLKEN_SCHWELLE` | Number | Bewoelkung in % |
   | `IBM_ENTLADUNG_AKTIV` | Switch | Teilfunktion Entladung ein/aus |
   | `IBM_ENTLADUNG_START` / `_ENDE` | Number | Stunde 0-23 |

4. Alle Logausgaben mit `[IBM]` praefixieren.

## Grundsatz: konfigurieren statt kopieren

Ein Steuerungsskript wird **pro Kunde nicht veraendert**. Unterscheidet sich
eine Anlage, gehoert der Unterschied in ein Item — nicht in eine Kopie des
Skripts. `inverters/fronius/control.js` zeigt das Muster: alle Zeitfenster,
Schwellwerte und Teilfunktionen kommen aus Items, jeweils mit einem
Rueckfallwert im Code, falls ein Item fehlt oder auf `NULL` steht.

Neue Items dafuer werden an vier Stellen ergaenzt:
`setup/03-install-items.sh` (Definition und Persistence),
`setup/04-install-rules.sh` (Startwert in `ibm_init.js`),
`setup/01-preflight.sh` (Kollisionspruefung) und `setup/ibm.conf.example`.
