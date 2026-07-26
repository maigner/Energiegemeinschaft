# IBM-Setup fuer openHABian

Richtet eine openHABian-Installation fuer das **ISCHLSTROM Batteriemanagement
(IBM)** ein.

## Ablauf beim Kunden

1. openHABian-Image auf die SD-Karte flashen, Pi starten, Ersteinrichtung
   abwarten (dauert beim ersten Boot einige Minuten).
2. Wechselrichter in der Main UI anlegen (`Settings -> Things`), Credentials
   hinterlegen und den Ladestands-Channel mit einem Item verknuepfen.
3. Per SSH einloggen und:

   ```bash
   curl -fsSL https://ischlstrom.org/ibm/install.sh -o install.sh
   sudo bash install.sh
   ```

Der Rest laeuft von selbst: das Paket wird geladen und gegen seine Pruefsumme
verifiziert, der Assistent erkennt Wechselrichter und Ladestands-Item und
fragt nur noch nach, was er nicht selbst herausfinden kann.

Die Kurzform funktioniert ebenfalls — die Abfragen lesen von `/dev/tty`, nicht
von stdin:

```bash
curl -fsSL https://ischlstrom.org/ibm/install.sh | sudo bash
```

Vollautomatisch, ohne jede Rueckfrage (uebernimmt alle Vorgaben):

```bash
curl -fsSL https://ischlstrom.org/ibm/install.sh -o install.sh
sudo IBM_ASSUME_YES=1 bash install.sh
```

### Umgebungsvariablen des Bootstraps

| Variable | Vorgabe | Zweck |
| --- | --- | --- |
| `IBM_BASE_URL` | `https://ischlstrom.org` | Quelle des Pakets (z. B. Testserver) |
| `IBM_DEST` | `/opt/ischlstrom` | Zielverzeichnis auf dem Pi |
| `IBM_ASSUME_YES` | `0` | `1` = keine Rueckfragen |

Bei einer erneuten Installation wird das alte Verzeichnis nach
`openhab.bak-<zeitstempel>` gesichert und eine vorhandene `ibm.conf`
uebernommen — ein Update aendert die Konfiguration der Anlage also nicht.

## Neues Paket veroeffentlichen

Auf dem Entwicklungsrechner:

```bash
cd Batteriemanagement/openhab/setup
./build-dist.sh          # erzeugt website/static/ibm/ibm-openhab.tar.gz + .sha256
cd ../../../website
./deploy-server.sh       # laedt es auf den Server
```

`build-dist.sh` legt das Paket in `website/static/ibm/` ab; SvelteKit liefert
alles unter `static/` an der Wurzel aus, das Paket ist danach unter
`https://ischlstrom.org/ibm/ibm-openhab.tar.gz` erreichbar. Tarball und
Pruefsumme sind gitignored — sie werden bei jedem Release neu gebaut.

Der Bootstrap `website/static/ibm/install.sh` ist dagegen eine gepflegte
Quelldatei im Repository und wird nicht generiert.

## Die einzelnen Schritte

`install-ibm.sh` fuehrt sie der Reihe nach aus; jedes laeuft auch einzeln.

| Skript | Wirkung |
| --- | --- |
| `00-wizard.sh` | Fragt die Anlagendaten ab und schreibt `ibm.conf`. Erkennt Wechselrichter und Ladestands-Item selbst. |
| `01-preflight.sh` | Prueft Dienst, Quellskripte, API, Thing, Item und Item-Kollisionen. Aendert nichts. |
| `02-install-addons.sh` | Traegt Binding, `jsscripting` und `mapdb` in `addons.cfg` ein. |
| `03-install-items.sh` | Schreibt `items/ibm.items` und `persistence/mapdb.persist`. |
| `04-install-rules.sh` | Erzeugt die zeitgesteuerten Regeln in `automation/js/`. |
| `05-verify.sh` | Prueft das Ergebnis, zeigt die letzten `[IBM]`-Logzeilen. Aendert nichts. |
| `build-dist.sh` | Nur auf dem Entwicklungsrechner: baut das Auslieferungspaket. |

Die Skripte sind **idempotent** — ein erneuter Lauf ist jederzeit gefahrlos.
Geaenderte Dateien werden vorher als `*.bak-<zeitstempel>` gesichert,
unveraenderte bleiben unangetastet.

## Andere Wechselrichter

Fronius ist die Vorgabe, aber nichts am Setup ist auf Fronius festgelegt. Alles
Herstellerabhaengige steht in `../inverters/<hersteller>/profile.sh`; der
Assistent listet automatisch auf, was dort liegt. Ein neuer Hersteller braucht
**keine Aenderung an den Setup-Skripten** — siehe
[../inverters/README.md](../inverters/README.md).

## Was installiert wird

**Items** (`/etc/openhab/items/ibm.items`, Gruppe `IBM`):

| Item | Typ | Herkunft |
| --- | --- | --- |
| `Schalte_ISCHLSTROM_Empfehlung_einaus` | Switch | Hauptschalter, vom Mitglied bedient |
| `Ischlstrom_Wolkenvorschau` | Number | API `/api/wolken/vorschau/v1` |
| `Ischlstrom_Crossover_Start` | String | API `/api/eeginfo/crossover/v1` |
| `Ischlstrom_Crossover_Ende` | String | API `/api/eeginfo/crossover/v1` |
| `IBM_MIN_BATTERY_CHARGE` | Number | Einstellung |
| `Minimale_Entladeleistung_Batterieeinspeisung` | Number | Einstellung |
| `Maximale_Entladeleistung_Batterieeinspeisung` | Number | Einstellung |
| `IBM_LADESPERRE_AKTIV` | Switch | Teilfunktion Ladesperre ein/aus |
| `IBM_LADESPERRE_START` / `_ENDE` | Number | Zeitfenster, Stunde 0-23 |
| `IBM_LADESPERRE_WOLKEN_SCHWELLE` | Number | Bewoelkungsgrad in % |
| `IBM_ENTLADUNG_AKTIV` | Switch | Teilfunktion Entladung ein/aus |
| `IBM_ENTLADUNG_START` / `_ENDE` | Number | Zeitfenster, Stunde 0-23 |

Das Ladestands-Item wird **nicht** angelegt — es entsteht beim Verknuepfen des
Channels in der Main UI und wird ueber `SOC_ITEM` nur referenziert.

Die Startwerte dieser Items stehen in `ibm.conf` (`DEFAULT_*`) und werden von
`ibm_init.js` gesetzt, solange ein Item noch `NULL` ist. Danach ist alles in
der Main UI aenderbar — **das Steuerungsskript wird pro Kunde nie angepasst**.

Eine passende Uebersichtsseite fuer die Main UI liegt in
`../inverters/fronius/overview.yaml`. Sie wird nicht automatisch installiert
(Main-UI-Seiten liegen in der JSONDB): `Settings -> Pages -> Overview ->
Code-Ansicht` und den Inhalt einfuegen.

**Regeln** (`/etc/openhab/automation/js/`, Tag `IBM`):

| Datei | Quelle | Zeitplan (Vorgabe) |
| --- | --- | --- |
| `ibm_cloud_forecast.js` | `../eeg-api/cloud_forecast.js` | stuendlich :40 |
| `ibm_crossover.js` | `../eeg-api/crossover.js` | taeglich 04:05 |
| `ibm_battery_control.js` | aus dem Wechselrichter-Profil | alle 5 Minuten |
| `ibm_init.js` | generiert | alle 10 Minuten |

## Warum die Skripte umgebaut werden

Die Dateien unter `../eeg-api` und die Steuerungsskripte sind reine
**Skriptkoerper**, wie man sie in der Main UI als "Script Action" einfuegt.
Dateibasiert braucht openHAB stattdessen eine Regel mit Trigger.
`04-install-rules.sh` bettet den Skriptkoerper daher unveraendert in

```js
rules.JSRule({ id: ..., triggers: [triggers.GenericCronTrigger(...)], execute: (event) => { /* Skriptkoerper */ } });
```

ein und ersetzt dabei die anlagenspezifischen Werte: Thing-UID,
Ladestands-Item und API-Basis-URL. Die Quellskripte bleiben dadurch
unveraendert und weiterhin 1:1 in der Main UI verwendbar.

Die Dateien in `automation/js/` sind **generiert** — Aenderungen dort gehen beim
naechsten Lauf verloren; stattdessen die Quelle im Repository anpassen und ein
neues Paket veroeffentlichen.

## Warnungen

**`addons.cfg` wird massgeblich.** Sobald dort eine Kategorie (`binding`,
`automation`, `persistence`) gesetzt ist, verwaltet die Datei diese Kategorie.
Addons derselben Kategorie, die nur ueber die Main UI installiert wurden und
nicht in der Datei stehen, koennen von openHAB entfernt werden.
`02-install-addons.sh` ergaenzt bestehende Werte deshalb, statt sie zu
ueberschreiben, legt ein Backup an und fragt vorher nach. Bei einer bereits
eingerichteten Anlage vorher `Settings -> Add-ons` pruefen — oder im
Assistenten die Addon-Verwaltung ablehnen.

**Datei-Items und UI-Items vertragen sich nicht.** Existiert eines der oben
genannten Items bereits in der Main UI, kollidiert es mit `ibm.items`.
`01-preflight.sh` erkennt das und bricht ab; die UI-Items muessen dann geloescht
werden. Das betrifft vor allem Anlagen, die frueher von Hand eingerichtet
wurden.

**Ohne Persistence stehen die Einstellungen nach einem Neustart auf `NULL`**, und
die Steuerung bricht mit "invalid value" ab. Deshalb richtet `03` `mapdb` mit
`restoreOnStartup` ein. `ibm_init.js` setzt zusaetzlich Startwerte, solange ein
Item noch `NULL`/`UNDEF` ist, damit eine frische Installation sofort laeuft.

**Die Steuerung greift in die Hardware ein.** Der Hauptschalter
`Schalte_ISCHLSTROM_Empfehlung_einaus` steht nach der Installation auf `OFF` —
erst nach dem Einschalten wird gesteuert.

## Fehlersuche

```bash
sudo /opt/ischlstrom/openhab/setup/05-verify.sh
tail -f /var/log/openhab/openhab.log | grep '\[IBM\]'
```

Alle Logmeldungen der IBM-Skripte sind mit `[IBM]` praefixiert.

Laeuft eine Regel nicht, in der Main UI unter `Settings -> Rules` nach dem Tag
`IBM` filtern und die Regel manuell ausfuehren — der Fehler steht dann im Log.

Konfiguration neu erfassen:

```bash
sudo /opt/ischlstrom/openhab/setup/00-wizard.sh
sudo /opt/ischlstrom/openhab/setup/install-ibm.sh
```

Falls in dieser openHAB-Installation die automatische Injektion der
`openhab`-Bibliothek deaktiviert wurde, fehlen den Regeln die globalen Objekte.
In dem Fall am Anfang der erzeugten Dateien ergaenzen:

```js
const { rules, triggers, items, actions, time, Quantity } = require('openhab');
```
