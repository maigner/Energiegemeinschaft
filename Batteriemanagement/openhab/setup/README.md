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
website/deploy-server.sh
```

Das Deploy-Skript ruft zuerst `build-dist.sh` auf (erzeugt
`website/static/ibm/ibm-openhab.tgz` + `.sha256`), laedt dann alles auf den
Server und baut dort den Docker-Container neu. `build-dist.sh` kann fuer
einen lokalen Test auch weiterhin einzeln ausgefuehrt werden.

`build-dist.sh` legt das Paket in `website/static/ibm/` ab; SvelteKit liefert
alles unter `static/` an der Wurzel aus, das Paket ist danach unter
`https://ischlstrom.org/ibm/ibm-openhab.tgz` erreichbar. Tarball und
Pruefsumme sind gitignored — sie werden bei jedem Release neu gebaut.
Die Endung ist bewusst `.tgz`: Dateien auf `*.gz` liefert der Static-Server
(sirv) mit `Content-Encoding: gzip` aus, Clients ohne `Accept-Encoding`
bekaemen dann das entpackte Tar und die Pruefsumme schluege fehl.

Der Bootstrap `website/static/ibm/install.sh` ist dagegen eine gepflegte
Quelldatei im Repository und wird nicht generiert.

`build-dist.sh` braucht `python3` mit PyYAML (`sudo apt install python3-yaml`),
um die Overview-Seiten der Profile nach `overview.page.json` zu wandeln.

## Die einzelnen Schritte

`install-ibm.sh` fuehrt sie der Reihe nach aus; jedes laeuft auch einzeln.

| Skript | Wirkung |
| --- | --- |
| `00-wizard.sh` | Fragt die Anlagendaten ab und schreibt `ibm.conf`. Erkennt Wechselrichter und Ladestands-Item selbst; fehlt das Thing, installiert er auf Wunsch das Binding und wartet auf das Anlegen in der Main UI. |
| `01-preflight.sh` | Prueft Dienst, Quellskripte, API, Thing, Item und Item-Kollisionen. Aendert nichts. |
| `02-install-addons.sh` | Traegt Binding, `jsscripting`, `mapdb` und (falls gewuenscht) `openhabcloud` in `addons.cfg` ein. |
| `03-install-items.sh` | Schreibt `items/ibm.items` und `persistence/mapdb.persist`. |
| `04-install-rules.sh` | Erzeugt die zeitgesteuerten Regeln in `automation/js/` und (falls gewuenscht) den Netzwerk-Watchdog. |
| `05-install-overview.sh` | Schreibt die IBM-Seiten (Overview + Unterseiten) per REST API in die Main UI (braucht `OH_API_TOKEN`; bestehende Seiten werden vorher gesichert). |
| `06-verify.sh` | Prueft das Ergebnis, zeigt die letzten `[IBM]`-Logzeilen. Aendert nichts. |
| `07-myopenhab.sh` | Zeigt UUID und Secret fuer die Registrierung auf myopenhab.org an (wartet ggf. auf das Cloud-Addon). Aendert nichts. |
| `08-install-wireguard.sh` | Richtet den WireGuard-Tunnel zum Wartungsserver ein (siehe [Fernwartung](#fernwartung-wireguard)). |
| `09-harden-ssh.sh` | Traegt den SSH-Wartungsschluessel (und eine optionale Benutzer-CA) ein und schaltet die Passwort-Anmeldung von sshd ab (siehe [SSH absichern](#ssh-absichern-nur-schluessel-anmeldung)). |
| `10-change-passwords.sh` | Aendert die Standardpasswoerter des Linux-Benutzers `openhabian` und der Karaf-Konsole (siehe [Standardpasswoerter aendern](#standardpasswoerter-aendern)). |
| `build-dist.sh` | Nur auf dem Entwicklungsrechner: baut das Auslieferungspaket. |

`install-ibm.sh` setzt ausserdem die Regionaleinstellungen - das, was sonst
der Ersteinrichtungs-Assistent der Main UI erledigt (der kann also samt
seinen Fragen einfach uebersprungen werden; nur das Admin-Konto muss dort
angelegt werden): die Systemzeitzone (`timedatectl`) sowie Zeitzone, Sprache,
Region und Masssystem von openHAB (`org.openhab.i18n:*` in
`services/runtime.cfg`; diese Eintraege gehen der Main-UI-Einstellung vor).
Vorgaben: `Europe/Vienna`, `de`, `AT`, `SI` - abweichend per
Umgebungsvariable `IBM_TIMEZONE`, `IBM_LANGUAGE`, `IBM_REGION`.

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
| `Ischlstrom_Ladesperre_Start` / `_Ende` | String | API `/api/eeginfo/ladefenster/v1` |
| `Ischlstrom_Ladesperre_Datum` | String | Tag, fuer den das Ladesperre-Fenster gilt |
| `IBM_MIN_BATTERY_CHARGE` | Number | Einstellung |
| `Minimale_Entladeleistung_Batterieeinspeisung` | Number | Einstellung |
| `Maximale_Entladeleistung_Batterieeinspeisung` | Number | Einstellung |
| `IBM_PAUSE_TAGE` | Number | Verbleibende Pausentage: solange > 0 setzt IBM aus; `ibm_pause.js` zaehlt jede Nacht um 1 herunter |
| `IBM_LADESPERRE_AKTIV` | Switch | Teilfunktion Ladesperre ein/aus |
| `IBM_LADESPERRE_WOLKEN_SCHWELLE` | Number | Bewoelkungsgrad in % |
| `IBM_ENTLADUNG_AKTIV` | Switch | Teilfunktion Entladung ein/aus |
| `IBM_DYNAMISCHE_LEISTUNG` | Switch | Entladeleistung automatisch an die Batteriegroesse anpassen |
| `IBM_BATTERIE_KAPAZITAET` | Number | Geschaetzte Batteriekapazitaet in kWh (von der Steuerung befuellt) |
| `IBM_KAPAZITAET_MESSUNG` | String | Interner Zustand der Kapazitaetsschaetzung (JSON) |

Das Entladefenster folgt den Crossover-Zeiten der Gemeinschaft
(`Ischlstrom_Crossover_Start`/`_Ende`): entladen wird vom abendlichen bis zum
morgendlichen Crossover, also solange die Gemeinschaft mehr verbraucht als
erzeugt. Liegen keine plausiblen Crossover-Zeiten vor (ischlstrom.org nie
erreichbar gewesen oder Werte unbrauchbar), wird **nicht** entladen - ein
Ersatz-Zeitfenster gibt es nicht.

Das Ladesperre-Fenster kommt aus der Tagesprognose
(`/api/eeginfo/ladefenster/v1`, berechnet aus den Kurven von `/vorhersage`):
gesperrt wird vom ersten Sonnenschein bis zum prognostizierten
Vormittags-Crossover. Die morgendliche Verbrauchsspitze der Gemeinschaft wird
so direkt aus der PV gedeckt; die Batterie laedt erst danach - und wie immer
ausschliesslich aus der eigenen PV-Anlage, nie aus dem Netz oder von anderen
Mitgliedern. Das Fenster gilt nur fuer das mitgelieferte Datum
(`Ischlstrom_Ladesperre_Datum`); ist es veraltet, unplausibel oder liefert
die Prognose keinen Ueberschuss (`-`), wird nicht gesperrt. Die
Wolken-Schwelle bleibt als zusaetzliche Bedingung bestehen: gesperrt wird nur
bei sonniger Vorschau. Die Wolkenvorschau gilt als veraltet, wenn ihr
letzter Abruf (`Ischlstrom_Wolkenvorschau_Zeit`) laenger als drei Stunden
zurueckliegt — die Steuerung sperrt dann kein Laden und entlaedt nur mit
minimaler Leistung.

### Dynamische Entladeleistung (Batteriegroesse wird geschaetzt)

Die Anlagen haben unterschiedlich grosse Batterien, und die Kapazitaet ist bei
der Einrichtung nicht bekannt. Die Steuerung schaetzt sie deshalb selbst:
waehrend der forcierten Entladung ist die Batterieleistung bekannt (sie wird
kommandiert), und das Skript summiert die entnommene Energie ueber die
5-Minuten-Laeufe auf. Ist der Ladestand um mindestens 8 Prozentpunkte
gefallen, ergibt Energie / Ladestandsdifferenz eine Stichprobe der Kapazitaet;
die Stichproben fliessen gleitend in die Schaetzung ein
(`IBM_BATTERIE_KAPAZITAET`, interner Zustand in `IBM_KAPAZITAET_MESSUNG`).
Unplausible Stichproben (unter 1 oder ueber 100 kWh) werden verworfen, und
nach Luecken, nicht angewendeten Schedules oder steigendem Ladestand setzt die
Messung neu auf. Eine typische Nacht liefert mehrere Stichproben — die
Schaetzung ist also meist schon nach der ersten Nacht belastbar.

Ab drei akzeptierten Stichproben leitet die Steuerung die Entladeleistung als
C-Rate aus der Schaetzung ab: minimal 0,1 C, maximal 0,3 C (eine
10-kWh-Batterie speist also wie bisher mit 1000–3000 W ein, eine 5-kWh-Batterie
mit 500–1500 W). Die Items `Minimale_/Maximale_Entladeleistung_...` bleiben der
Rueckfall, solange keine belastbare Schaetzung vorliegt oder
`IBM_DYNAMISCHE_LEISTUNG` auf `OFF` steht. Unabhaengig davon gilt eine **harte
Obergrenze von 5000 W** (`ABSOLUTE_MAX_DISCHARGE_W` im Steuerungsskript), die
weder durch Einstellungen noch durch die Schaetzung ueberschritten werden kann.

Die Schaetzung nutzt die kommandierte Leistung, nicht eine Messung — zieht der
Haushalt nachts mehr, als kommandiert ist, faellt die Schaetzung etwas zu
klein aus. Das ist gewollt konservativ: die abgeleitete Leistung ist dann eher
zu niedrig als zu hoch.

Das Ladestands-Item und das Batterieleistungs-Item werden **nicht** angelegt —
sie entstehen beim Verknuepfen der Channels in der Main UI und werden ueber
`SOC_ITEM` bzw. `BATTERY_POWER_ITEM` nur referenziert (letzteres zeigt auf der
Overview-Seite die aktuelle Einspeiseleistung der Batterie).

Die Startwerte dieser Items stehen in `ibm.conf` (`DEFAULT_*`) und werden von
`ibm_init.js` gesetzt, solange ein Item noch `NULL` ist. Danach ist alles in
der Main UI aenderbar — **das Steuerungsskript wird pro Kunde nie angepasst**.

**Main-UI-Seiten:** Die Seiten fuer die Main UI liegen in
`../inverters/fronius/overview.yaml` — fuer die Bedienung am Handy aufgeteilt
in eine kompakte Overview (Zustand, Hauptschalter, Navigation) und vier
Unterseiten (`ibm_laden`, `ibm_einspeisen`, `ibm_pause`, `ibm_experten`).
Main-UI-Seiten
liegen in der JSONDB, deshalb installiert `05-install-overview.sh` sie per
REST API — dafuer wird das openHAB-API-Token gebraucht (`OH_API_TOKEN`, fragt
der Assistent ab), und `build-dist.sh` wandelt jede Seite beim Paketbau nach
`page-<uid>.json`. Bestehende Seiten werden vorher nach
`/var/lib/openhab/ibm/` gesichert. Ohne Token bleibt der manuelle Weg: je
Eintrag unter `pages:` eine Seite anlegen (`Settings -> Pages`) und den
Inhalt in der Code-Ansicht einfuegen.

**Regeln** (`/etc/openhab/automation/js/`, Tag `IBM`):

| Datei | Quelle | Zeitplan (Vorgabe) |
| --- | --- | --- |
| `ibm_cloud_forecast.js` | `../eeg-api/cloud_forecast.js` | stuendlich :40 |
| `ibm_crossover.js` | `../eeg-api/crossover.js` | taeglich 04:05 |
| `ibm_ladesperre.js` | `../eeg-api/ladefenster.js` | stuendlich :50 |
| `ibm_battery_control.js` | aus dem Wechselrichter-Profil | alle 5 Minuten |
| `ibm_status_push.js` (optional) | `../eeg-api/status_push.js` | alle 5 Minuten |
| `ibm_init.js` | generiert | alle 10 Minuten |
| `ibm_pause.js` | generiert | taeglich 00:30 |
| `ibm_watchdog.js` (optional) | generiert | bei Bridge-OFFLINE + alle 15 Minuten |

## Status-Push (Vorstands-Dashboard)

Auf Wunsch (Frage im Assistenten, `INSTALL_STATUS_PUSH=1`) meldet die Anlage
alle 5 Minuten ihren Zustand an `<IBM_API_BASE>/api/ibm/status/v1` — der
Vorstand sieht alle Anlagen dann live unter
<https://ischlstrom.org/board/openhab> (Ladestand, Wechselrichter-Status,
Schalterstellungen, geschaetzte Kapazitaet, letzte Meldung). Uebertragen
werden ausschliesslich die IBM-Betriebsdaten aus der Tabelle oben, keine
Verbrauchsdaten des Haushalts.

Die Anlage authentifiziert sich mit einem **Status-Token**, das der Vorstand
**vor der Installation** auf <https://ischlstrom.org/board/openhab> fuer das
Mitglied erzeugt (Abschnitt "Tokens"). Der Assistent fragt das Token ab und
legt es als `IBM_STATUS_TOKEN` in der `ibm.conf` ab; dazu kommt der
Anzeigename `IBM_ANLAGE_NAME` (Vorgabe: Hostname). Meldungen mit unbekanntem
Token weist der Server ab. Auf dem Server liegen die Tokens in der Tabelle
`members_openhabstatus`; **Loeschen auf dem Dashboard widerruft das Token**,
die Anlage kann dann nicht mehr melden, bis ein neues Token eingetragen wird.

**Nachruesten** bei bestehender Installation: Token auf dem Dashboard
erzeugen und einfach das Paket-Update einspielen (`curl ... install.sh`,
siehe oben). Fehlt der Status-Abschnitt in der uebernommenen `ibm.conf`,
fragt `04-install-rules.sh` beim Lauf selbst nach Token und Anlagenname und
traegt die Antworten in die `ibm.conf` ein. Eine bewusste Ablehnung
(`INSTALL_STATUS_PUSH=0`) wird bei spaeteren Updates nicht erneut gefragt;
zum Aktivieren dann `INSTALL_STATUS_PUSH=1` und `IBM_STATUS_TOKEN` in
`ibm.conf` eintragen und `04-install-rules.sh` erneut ausfuehren (bei
unattended Updates mit `IBM_ASSUME_YES=1` wird nie gefragt und der Push
bleibt aus). Abschalten: `INSTALL_STATUS_PUSH=0` in `ibm.conf` eintragen,
`04-install-rules.sh` erneut ausfuehren und die Datei
`automation/js/ibm_status_push.js` loeschen.

Ausbleibende Meldungen zeigt das Dashboard an (gelb nach 15 Minuten, rot
nach einer Stunde) — es eignet sich damit auch als einfache
Ausfallueberwachung der openhabians.

Ein Klick auf eine Anlage oeffnet die **Detailseite** mit Diagrammen der
letzten Woche: Batterie-Ladestand sowie Batterieleistung und Einspeisung
aus der Batterie ins Netz. Die Kurven entstehen aus den Statusmeldungen
(5-Minuten-Raster, serverseitig 30 Tage aufbewahrt). Die Leistungswerte
liefert die Anlage nur, wenn die Channels fuer Batterie- und Netzleistung
in der Main UI mit Items verknuepft sind (bei Fronius:
`Fronius_Symo_Inverter_Battery_Power`, `Fronius_Symo_Inverter_Grid_Power`,
optional `Solar_Plant_Power` und `Load_Power`); ohne diese Items fehlt nur
das Leistungsdiagramm, der Rest funktioniert unveraendert.

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

`07-myopenhab.sh` wartet auf das Secret (die Addon-Installation ueber
`addons.cfg` kann einige Minuten dauern) und zeigt dann beide Werte mit der
Anleitung an. Jederzeit erneut abrufbar:

```bash
sudo /opt/ischlstrom/openhab/setup/07-myopenhab.sh
```

Registrierung: auf <https://myopenhab.org> ueber *Sign up* ein Konto anlegen
(E-Mail-Adresse und Passwort des Mitglieds) und dabei UUID und Secret
eintragen — beides ist spaeter unter *Account* aenderbar. Sobald die Anlage
verbunden ist, zeigt myopenhab.org sie als *Online*; falls nicht, openHAB
einmal neu starten (`sudo systemctl restart openhab.service`).

Standardmaessig werden dabei **keine Items** zur Cloud uebertragen
(exponiert) — die Verbindung dient nur dem Fernzugriff auf die UI und den
Benachrichtigungen.

## Fernwartung (WireGuard)

Nach der Installation beim Mitglied gibt es keinen direkten SSH-Zugang mehr
zum Pi. Auf Wunsch (Frage im Assistenten, `INSTALL_WIREGUARD=1`) richtet
`08-install-wireguard.sh` deshalb einen **ausgehenden WireGuard-Tunnel** zum
Wartungsserver ein. Der Pi haelt die Verbindung selbst offen
(`PersistentKeepalive`), am Router des Mitglieds muss nichts geoeffnet
werden, und durch den Tunnel laeuft ausschliesslich das Wartungsnetz
(`10.88.0.0/24`) — der normale Internetverkehr bleibt unberuehrt.

**Adressplan:** Der Wartungsserver ist `10.88.0.1`, jede Anlage bekommt eine
eindeutige Tunnel-IP ab `10.88.0.11` (`WG_ADDRESS`, fragt der Assistent ab).
Die Peer-Liste in der `wg0.conf` des Servers ist die Registry — je Peer einen
Kommentar mit Anlagenname und IP dazuschreiben.

### Einmalig auf dem Wartungsserver

```bash
sudo apt install wireguard
sudo bash -c 'umask 077 && wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub'
sudo ufw allow 51820/udp
sudo systemctl enable --now wg-quick@wg0
```

`/etc/wireguard/wg0.conf` auf dem Server:

```ini
[Interface]
Address    = 10.88.0.1/24
ListenPort = 51820
PrivateKey = <Inhalt von server.key>

# je Anlage ein [Peer]-Block, siehe unten
```

Danach zwei Dateien nach `website/static/ibm/` legen und deployen — beide
sind oeffentlich und werden vom Setup auf dem Pi geladen:

| Datei | Inhalt |
| --- | --- |
| `wg-server.pub` | Public Key des Wartungsservers (`server.pub`) |
| `ssh-maintainer.pub` | SSH-Public-Key fuer die Fernwartung; `09-harden-ssh.sh` traegt ihn in die `authorized_keys` des Benutzers `WG_SSH_USER` (Vorgabe `openhabian`) ein. Fehlt die Datei, wird kein Schluessel eingetragen. |
| `ssh-user-ca.pub` | Optional: Public Key einer SSH-Benutzer-CA fuer zertifikatsbasierte Anmeldung (siehe [SSH absichern](#ssh-absichern-nur-schluessel-anmeldung)). |

### Je Anlage

1. Der Assistent fragt die Tunnel-IP ab; `08-install-wireguard.sh` erzeugt
   das Schluesselpaar (`/etc/wireguard/ibm-pi.key`), schreibt die `wg0.conf`,
   startet den Tunnel und zeigt am Ende den fertigen `[Peer]`-Block an.
2. Diesen Block auf dem Wartungsserver in `/etc/wireguard/wg0.conf`
   eintragen und neu laden (bestehende Tunnel bleiben verbunden):

   ```bash
   sudo bash -c 'wg syncconf wg0 <(wg-quick strip wg0)'
   ```

3. Das Skript wartet auf Wunsch auf den ersten Handshake — so ist vor dem
   Verlassen der Anlage sicher, dass der Tunnel steht.

Zugriff danach vom Wartungsserver aus (`ssh openhabian@10.88.0.<x>`) oder
bequem vom eigenen Rechner per ProxyJump in `~/.ssh/config`:

```
Host pi-*
    User openhabian
    ProxyJump <benutzer>@s1.ischlstrom.org

Host pi-mueller
    HostName 10.88.0.11
```

**Nachruesten** bei bestehender Installation: `INSTALL_WIREGUARD=1` und
`WG_ADDRESS` in `ibm.conf` eintragen, dann
`sudo /opt/ischlstrom/openhab/setup/08-install-wireguard.sh` ausfuehren.

Kein Handshake? Peer-Eintrag auf dem Server, `WG_SERVER_ENDPOINT` und die
Server-Firewall pruefen (UDP 51820 muss offen sein); der klassische Fehler
sind vertauschte Public Keys (jede Seite traegt den Key der **Gegenseite**
ein). Status auf dem Pi: `sudo wg show wg0`.

## SSH absichern (nur Schluessel-Anmeldung)

openHABian kommt mit dem allgemein bekannten Standardpasswort
`openhabian:openhabian`. Auf Wunsch (Frage im Assistenten,
`INSTALL_SSH_HARDENING=1`) stellt `09-harden-ssh.sh` die SSH-Anmeldung auf
Schluessel um und schaltet die Passwort-Anmeldung ab:

1. Der **SSH-Wartungsschluessel** (`<IBM_API_BASE>/ibm/ssh-maintainer.pub`)
   wird in die `authorized_keys` des Benutzers `WG_SSH_USER` (Vorgabe
   `openhabian`) eingetragen — derselbe Schritt, den frueher das
   WireGuard-Setup miterledigt hat.
2. Liegt zusaetzlich `<IBM_API_BASE>/ibm/ssh-user-ca.pub` auf dem Server,
   wird der Key als **Benutzer-CA** nach `/etc/ssh/ibm-user-ca.pub`
   uebernommen (`TrustedUserCAKeys`) — dann gelten auf allen Anlagen auch
   SSH-Zertifikate, die das Wartungsteam signiert hat (siehe unten).
3. Die Passwort-Anmeldung wird per Drop-in
   `/etc/ssh/sshd_config.d/90-ibm-hardening.conf` abgeschaltet
   (`PasswordAuthentication no`, `ChallengeResponseAuthentication no`,
   `PermitRootLogin no`); danach wird sshd neu geladen — bestehende
   Sitzungen bleiben verbunden.

**Aussperrschutz:** Abgeschaltet wird nur, wenn mindestens ein gueltiger
Schluessel in den `authorized_keys` steht oder die Benutzer-CA installiert
ist; ausserdem prueft `sshd -t` die neue Konfiguration und bei einem Fehler
wird sie zurueckgerollt. Vor dem Bestaetigen die Schluessel-Anmeldung am
besten in einem zweiten Terminal testen. Die Konsole (Tastatur/Monitor am
Pi) ist nicht betroffen — dort gilt das Passwort weiter, deshalb zusaetzlich
das Standardpasswort aendern lassen (siehe
[Standardpasswoerter aendern](#standardpasswoerter-aendern)).

### Einmalig auf dem Wartungsserver

Wartungsschluessel erzeugen und den Public Key veroeffentlichen (nach
`website/static/ibm/` legen und deployen):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ischlstrom-wartung -C "wartung@ischlstrom"
cp ~/.ssh/ischlstrom-wartung.pub website/static/ibm/ssh-maintainer.pub
```

Der private Schluessel bleibt auf dem Wartungsrechner; in `~/.ssh/config`
beim ProxyJump-Eintrag `IdentityFile ~/.ssh/ischlstrom-wartung` ergaenzen.

### Optional: SSH-Zertifikate (Benutzer-CA)

Sollen mehrere Personen warten, ohne dass je Anlage neue Schluessel
eingetragen werden, lohnt sich eine Benutzer-CA: die Anlagen vertrauen der
CA, und die CA signiert die Schluessel der Wartenden — auf Wunsch befristet.

```bash
# CA erzeugen (Passphrase setzen, Datei gut sichern)
ssh-keygen -t ed25519 -f ~/.ssh/ischlstrom-user-ca -C "user-ca@ischlstrom"
cp ~/.ssh/ischlstrom-user-ca.pub website/static/ibm/ssh-user-ca.pub

# Schluessel eines Wartenden fuer 26 Wochen signieren
# (-n openhabian: das Zertifikat gilt fuer den Benutzer 'openhabian')
ssh-keygen -s ~/.ssh/ischlstrom-user-ca -I "martin" -n openhabian \
  -V +26w ~/.ssh/id_ed25519.pub
```

Das erzeugte `id_ed25519-cert.pub` liegt neben dem eigenen Schluessel und
wird von `ssh` automatisch mitgeschickt — auf den Anlagen ist nichts weiter
einzutragen. Abgelaufene Zertifikate verlieren ihre Gueltigkeit von selbst.

**Nachruesten** bei bestehender Installation: `INSTALL_SSH_HARDENING=1` in
`ibm.conf` eintragen, dann
`sudo /opt/ischlstrom/openhab/setup/09-harden-ssh.sh` ausfuehren.
Rueckgaengig machen: `/etc/ssh/sshd_config.d/90-ibm-hardening.conf` loeschen
und `sudo systemctl reload ssh`.

## Standardpasswoerter aendern

Auf Wunsch (Frage im Assistenten, `INSTALL_PASSWORD_CHANGE=1`) aendert
`10-change-passwords.sh` die allgemein bekannten Standardpasswoerter von
openHABian - und zwar nur dort, wo sie noch gelten; selbst gesetzte
Passwoerter bleiben unangetastet, ein erneuter Lauf ist gefahrlos:

- **Linux-Benutzer `openhabian`** (Passwort `openhabian`; gilt fuer SSH,
  Konsole und Samba): Das neue Passwort wird bei der Installation abgefragt
  oder aus der Umgebungsvariable `IBM_NEW_PASSWORD` uebernommen (mindestens
  8 Zeichen). Ist der Benutzer bei Samba eingerichtet, wird das
  Samba-Passwort mitgeaendert. Ohne Eingabe und ohne `IBM_NEW_PASSWORD`
  (z. B. bei `IBM_ASSUME_YES=1`) bleibt das Passwort unveraendert - es wird
  nichts erraten und nichts ins Log geschrieben, nur gewarnt.
- **Karaf-Konsole, Benutzer `openhab`** (Passwort `habopen`, in
  `/var/lib/openhab/etc/users.properties` je nach openHAB-Version im
  Klartext oder als SHA-256-Hash abgelegt - beides wird erkannt): Wird
  durch ein zufaellig
  erzeugtes Passwort ersetzt und einmalig angezeigt (alternativ
  `IBM_NEW_CONSOLE_PASSWORD`, nur Buchstaben und Ziffern). Die Konsole ist
  nur von localhost erreichbar; geht das Passwort verloren, laesst es sich
  als root in `users.properties` jederzeit neu setzen.

Passwoerter stehen nie in `ibm.conf` - das Skript fragt zur Laufzeit bzw.
liest die genannten Umgebungsvariablen.

**Nachruesten** bei bestehender Installation: `INSTALL_PASSWORD_CHANGE=1` in
`ibm.conf` eintragen, dann
`sudo /opt/ischlstrom/openhab/setup/10-change-passwords.sh` ausfuehren.

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
sudo /opt/ischlstrom/openhab/setup/06-verify.sh
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
