# IBM-Setup fuer openHABian

Richtet eine openHABian-Installation fuer das **ISCHLSTROM Batteriemanagement
(IBM)** ein.

## Ablauf beim Kunden

1. openHABian-Image auf die SD-Karte flashen, Pi starten, Ersteinrichtung
   abwarten (dauert beim ersten Boot einige Minuten).
2. Wechselrichter in der Main UI anlegen (`Settings -> Things`), Credentials
   hinterlegen und den Ladestands-Channel mit einem Item verknuepfen.
   Dieser Schritt kann auch uebersprungen und waehrend der Installation
   nachgeholt werden: fehlt das Thing, bietet der Assistent an, das Binding
   selbst ueber `addons.cfg` zu installieren, und wartet dann, bis der
   Wechselrichter in der Main UI angelegt ist.
3. Per SSH einloggen und:

   ```bash
   curl -fsSL https://ischlstrom.org/ibm/install.sh -o install.sh
   sudo bash install.sh
   ```

Der Rest laeuft von selbst: das Paket wird geladen und gegen seine Pruefsumme
verifiziert, der Assistent erkennt Wechselrichter und Ladestands-Item und
fragt nur noch nach, was er nicht selbst herausfinden kann. Wurde openHAB
Cloud gewuenscht, zeigt die Installation am Ende UUID und Secret fuer die
Registrierung auf myopenhab.org an (siehe
[openHAB Cloud](#openhab-cloud-myopenhaborg)).

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
./build-dist.sh          # erzeugt website/static/ibm/ibm-openhab.tgz + .sha256
cd ../../../website
./deploy-server.sh       # laedt es auf den Server
```

`build-dist.sh` legt das Paket in `website/static/ibm/` ab; SvelteKit liefert
alles unter `static/` an der Wurzel aus, das Paket ist danach unter
`https://ischlstrom.org/ibm/ibm-openhab.tgz` erreichbar. Tarball und
Pruefsumme sind gitignored — sie werden bei jedem Release neu gebaut.
Die Endung ist bewusst `.tgz`: Dateien auf `*.gz` liefert der Static-Server
(sirv) mit `Content-Encoding: gzip` aus, Clients ohne `Accept-Encoding`
bekaemen dann das entpackte Tar und die Pruefsumme schluege fehl.

Der Bootstrap `website/static/ibm/install.sh` ist dagegen eine gepflegte
Quelldatei im Repository und wird nicht generiert.

## Die einzelnen Schritte

`install-ibm.sh` fuehrt sie der Reihe nach aus; jedes laeuft auch einzeln.

| Skript | Wirkung |
| --- | --- |
| `00-wizard.sh` | Fragt die Anlagendaten ab und schreibt `ibm.conf`. Erkennt Wechselrichter und Ladestands-Item selbst; fehlt das Thing, installiert er auf Wunsch das Binding und wartet auf das Anlegen in der Main UI. |
| `01-preflight.sh` | Prueft Dienst, Quellskripte, API, Thing, Item und Item-Kollisionen. Aendert nichts. |
| `02-install-addons.sh` | Traegt Binding, `jsscripting`, `mapdb` und (falls gewuenscht) `openhabcloud` in `addons.cfg` ein. |
| `03-install-items.sh` | Schreibt `items/ibm.items` und `persistence/mapdb.persist`. |
| `04-install-rules.sh` | Erzeugt die zeitgesteuerten Regeln in `automation/js/` und (falls gewuenscht) den Netzwerk-Watchdog. |
| `05-verify.sh` | Prueft das Ergebnis, zeigt die letzten `[IBM]`-Logzeilen. Aendert nichts. |
| `06-myopenhab.sh` | Zeigt UUID und Secret fuer die Registrierung auf myopenhab.org an (wartet ggf. auf das Cloud-Addon). Aendert nichts. |
| `build-dist.sh` | Nur auf dem Entwicklungsrechner: baut das Auslieferungspaket. |

`install-ibm.sh` setzt ausserdem die Zeitzone auf `Europe/Vienna` — sowohl die
Systemzeitzone (`timedatectl`) als auch die Regionaleinstellung von openHAB
(`org.openhab.i18n:timezone` in `services/runtime.cfg`; dieser Eintrag geht der
Main-UI-Einstellung vor). Abweichende Zeitzone: `IBM_TIMEZONE` als
Umgebungsvariable setzen.

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
| `Ischlstrom_Wolkenvorschau_Zeit` | String | Abrufzeitpunkt der Wolkenvorschau (Aktualitaetspruefung) |
| `Ischlstrom_Crossover_Start` | String | API `/api/eeginfo/crossover/v1` |
| `Ischlstrom_Crossover_Ende` | String | API `/api/eeginfo/crossover/v1` |
| `IBM_MIN_BATTERY_CHARGE` | Number | Einstellung |
| `Minimale_Entladeleistung_Batterieeinspeisung` | Number | Einstellung |
| `Maximale_Entladeleistung_Batterieeinspeisung` | Number | Einstellung |
| `IBM_LADESPERRE_AKTIV` | Switch | Teilfunktion Ladesperre ein/aus |
| `IBM_LADESPERRE_START` / `_ENDE` | Number | Zeitfenster, Stunde 0-23 |
| `IBM_LADESPERRE_WOLKEN_SCHWELLE` | Number | Bewoelkungsgrad in % |
| `IBM_ENTLADUNG_AKTIV` | Switch | Teilfunktion Entladung ein/aus |
| `IBM_ENTLADUNG_START` / `_ENDE` | Number | Rueckfall-Zeitfenster, Stunde 0-23 |

Das Entladefenster folgt den Crossover-Zeiten der Gemeinschaft
(`Ischlstrom_Crossover_Start`/`_Ende`): entladen wird vom abendlichen bis zum
morgendlichen Crossover, also solange die Gemeinschaft mehr verbraucht als
erzeugt. `IBM_ENTLADUNG_START`/`_ENDE` greifen nur, wenn keine plausiblen
Crossover-Zeiten vorliegen. Die Wolkenvorschau gilt als veraltet, wenn ihr
letzter Abruf (`Ischlstrom_Wolkenvorschau_Zeit`) laenger als drei Stunden
zurueckliegt — die Steuerung sperrt dann kein Laden und entlaedt nur mit
minimaler Leistung.

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
| `ibm_watchdog.js` (optional) | generiert | bei Bridge-OFFLINE + alle 15 Minuten |

## Netzwerk-Watchdog (wechselnde IP des Wechselrichters)

Teilt der Router dem Wechselrichter per DHCP eine neue IP zu, verliert das
Binding die Verbindung und die Steuerung faellt aus. Der Watchdog behebt das
automatisch, ohne dass am Router des Mitglieds etwas umgestellt werden muss:

1. Geht das Bridge-Thing auf `OFFLINE` (zusaetzlich Fallback-Pruefung alle
   15 Minuten), ruft die Regel `ibm_watchdog.js` das Skript
   `/etc/openhab/scripts/ibm_rediscover.sh` auf.
2. Antwortet die konfigurierte Adresse noch (z. B. Datamanager im
   Nachtmodus, falsche Credentials), passiert nichts - das Problem liegt
   dann nicht an der IP.
3. Sonst wird das eigene /24-Netz nach der Fronius Solar API abgesucht
   (`/solar_api/GetAPIVersion.cgi`, parallele `curl`-Aufrufe, wenige
   Sekunden) - fruehestens alle `WATCHDOG_COOLDOWN_MIN` Minuten.
4. Gefundene Geraete werden ueber ihre Seriennummer (`UniqueID` aus
   `GetInverterInfo.cgi`) mit der gemerkten Seriennummer der Anlage
   abgeglichen, damit nie ein fremdes Geraet uebernommen wird. Die
   Seriennummer merkt sich der Watchdog selbst, solange die Anlage
   `ONLINE` ist (`/var/lib/openhab/ibm/inverter_serial`).
5. Die neue Adresse wird per REST API (`PUT /rest/things/<uid>/config`) in
   das Bridge-Thing eingetragen; das Binding verbindet sich daraufhin von
   selbst neu.

Der Watchdog braucht ein **openHAB-API-Token** eines Admin-Benutzers
(Main UI -> links unten auf den Benutzernamen klicken -> "Create new API
token"). Der Assistent fragt danach; ohne Token wird der Watchdog
uebersprungen und kann spaeter nachgeruestet werden: `INSTALL_WATCHDOG=1`,
`INVERTER_HOST_THING_UID` und `OH_API_TOKEN` in `ibm.conf` eintragen, dann
`04-install-rules.sh` erneut ausfuehren. Das Token liegt danach in
`/var/lib/openhab/ibm/api_token` (nur fuer den openhab-Benutzer lesbar).

Manueller Testlauf (auch bei `ONLINE`, erzwingt die Suche):

```bash
sudo -u openhab /etc/openhab/scripts/ibm_rediscover.sh --force
```

Alle Meldungen erscheinen mit dem Praefix `[IBM][Watchdog]` im openhab.log.

## openHAB Cloud (myopenhab.org)

Auf Wunsch (Frage im Assistenten, `INSTALL_CLOUD=1`) richtet das Setup den
**openHAB Cloud Connector** ein. Damit ist die Main UI von unterwegs unter
`https://home.myopenhab.org` erreichbar und die Anlage kann
Benachrichtigungen an die openHAB-App schicken.

Fuer die Registrierung braucht myopenhab.org zwei Werte der Installation:

| Wert | Datei auf dem Pi |
| --- | --- |
| UUID | `/var/lib/openhab/uuid` (legt openHAB beim ersten Start an) |
| Secret | `/var/lib/openhab/openhabcloud/secret` (entsteht beim ersten Start des Cloud-Addons) |

`06-myopenhab.sh` wartet auf das Secret (die Addon-Installation ueber
`addons.cfg` kann einige Minuten dauern) und zeigt dann beide Werte mit der
Anleitung an. Jederzeit erneut abrufbar:

```bash
sudo /opt/ischlstrom/openhab/setup/06-myopenhab.sh
```

Registrierung: auf <https://myopenhab.org> ueber *Sign up* ein Konto anlegen
(E-Mail-Adresse und Passwort des Mitglieds) und dabei UUID und Secret
eintragen — beides ist spaeter unter *Account* aenderbar. Sobald die Anlage
verbunden ist, zeigt myopenhab.org sie als *Online*; falls nicht, openHAB
einmal neu starten (`sudo systemctl restart openhab.service`).

Standardmaessig werden dabei **keine Items** zur Cloud uebertragen
(exponiert) — die Verbindung dient nur dem Fernzugriff auf die UI und den
Benachrichtigungen.

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
`automation`, `persistence`, `misc`) gesetzt ist, verwaltet die Datei diese Kategorie.
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
