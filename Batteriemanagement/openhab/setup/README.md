# IBM-Setup fuer openHABian

Richtet eine openHABian-Installation fuer das **ISCHLSTROM Batteriemanagement
(IBM)** ein.

## Zero-Touch-Einrichtung (Standardweg seit 2026-08)

Plan und Hintergrund: [docs/ibm-setup-vereinfachung.md](../../../docs/ibm-setup-vereinfachung.md).
Das Mitglied muss nichts am Pi tun; der Vorstand bereitet die SD-Karte vor:

1. **Dashboard** <https://ischlstrom.org/board/openhab>, Abschnitt
   "Einrichtung": Mitglied auswaehlen, "SD-Karte vorbereiten". Dabei
   entstehen automatisch Status-Token, Tunnel-IP (Pool ab 10.88.0.11),
   Linux-/Admin-Passwort, openHAB-Cloud-Identitaet (UUID/Secret),
   Cloud-Konto `<nnn>@ischlstrom.org` samt Mail-Alias auf `info@` und ein
   Provisionierungs-Code (60 Tage gueltig). Das Cloud-Konto und der
   WireGuard-Peer werden vom Timer `ibm-provision-sync` auf s1 angelegt
   (siehe `scripts/ibm-provision/`, [docs/server-setup.md](../../../docs/server-setup.md)).
   Das Wechselrichter-Profil dabei gleich setzen (fuer den Standardablauf
   unten noetig; die automatische Erkennung funktioniert nur, wenn der
   Wechselrichter im selben Netz haengt). Optional WLAN-Zugang (LAN bleibt
   die Empfehlung).
2. **Zip herunterladen** (`sd-<nnn>.zip`: `openhabian.conf`,
   `ibm-provision.conf`, `user-data`, `README.txt`) und die Karte
   schreiben (macOS oder Linux; ohne Geraete-Argument listet das Skript
   die Karten auf):

   ```bash
   sudo ./prepare-sd.sh sd-007.zip /dev/disk4    # macOS
   sudo ./prepare-sd.sh sd-007.zip /dev/sdb      # Linux
   ```

   `prepare-sd.sh` laedt das aktuelle openHABian-Image (64-bit) in den
   Cache (`/Library/Caches/ischlstrom` auf macOS, `/var/cache/ischlstrom`
   auf Linux), schreibt es und bestueckt die Boot-Partition (FAT):
   Hostname, Passwort, Zeitzone und WLAN kommen in die `openhabian.conf`
   der Karte, `ibm-provision.conf` (nur Code und Server-URL) und
   `user-data` daneben. Den Autostart installiert cloud-init (im Image
   enthalten, NoCloud-Datasource liest die Boot-Partition) beim ersten
   Boot aus der `user-data`: die systemd-Unit `ibm-firstboot`
   (`firstboot/`). Es wird nur die FAT-Partition beschrieben, ext4-Zugriff
   und SSH auf den Pi sind nicht noetig. Alternativ von Hand: Image mit
   dem Raspberry Pi Imager schreiben (ohne eigene Anpassungen) und die
   drei Konfigurationsdateien aus dem Zip auf die Boot-Partition kopieren
   - der Effekt ist derselbe.

   **Fertiges Image vom Server (auch Windows)**: am Dashboard "Image
   erstellen" - die Website baut auf s1 das fertige `pi-<nnn>.img.gz`
   (offizielles openHABian-Image plus die drei Dateien, eingespielt per
   mtools; `website/src/lib/server/ibmImage.js`, dauert einige Minuten).
   Danach "Image herunterladen" und mit dem Raspberry Pi Imager
   ("Eigenes Image") oder balenaEtcher auf die Karte schreiben - auf
   Windows, macOS oder Linux, ganz ohne Zip und Dateikopieren.
3. **Beim Mitglied**: Karte in den Pi, LAN-Kabel (gleiches Netz wie der
   Wechselrichter) und Strom anstecken. openHABian installiert sich selbst
   (30 bis 45 Minuten, Neustart), dann startet `ibm-firstboot` das Setup:
   `00-provision.sh` loest den Code bei `POST /api/ibm/provision/v1` ein,
   erkennt das Wechselrichter-Profil (Netzsuche aller Profile), schreibt
   `ibm.conf`, und `install-ibm.sh` laeuft ohne Rueckfragen durch. Jeder
   Schritt meldet seine Phase an `/api/ibm/provision/v1/result`; Dashboard
   und Mitgliederbereich (`/user/<nr>/speichermanagement`) zeigen den
   Fortschritt.
4. **Wechselrichter-Passwort** (GEN24): das Mitglied (oder der Vorstand)
   traegt es im Mitgliederbereich bzw. am Dashboard ein. Der Pi fragt in
   der Phase `wartet_auf_passwort` alle zwei Minuten bei
   `/api/ibm/provision/v1/secret` nach, der Server liefert es einmalig aus
   und loescht es. Kommt innerhalb von 30 Minuten keines, laeuft die
   Installation ohne weiter (Exit 75 = unvollstaendig) und `ibm-firstboot`
   wiederholt sie alle 10 Minuten, bis alles fertig ist; das Passwort wird
   dann per REST ins Bridge-Thing nachgetragen.

### Standardablauf: Test im Netz des Vorstands

Standard seit 2026-08: der Vorstand baut das Image, flasht die Karte und
laesst den Pi zuerst **im eigenen Netz** installieren; erst die getestete
Karte geht ans Mitglied. Schritt fuer Schritt in der Vorstands-Anleitung
[docs/setup/](../../../docs/setup/) (PDF); Kurzfassung:

1. "SD-Karte vorbereiten" **mit gesetztem Wechselrichter-Profil** (im
   Testnetz gibt es den Wechselrichter nicht; ohne Profil wartet der Pi
   in `wechselrichter_unklar`).
2. "Image erstellen", herunterladen, flashen (Raspberry Pi Imager mit
   "Eigenes Image" und ohne OS-Anpassungen, oder balenaEtcher).
3. Pi per LAN-Kabel ins eigene Netz, Strom anstecken, Phasen am Dashboard
   beobachten. Erwartetes Ende nach 30 bis 45 Minuten: Fernwartung,
   Passwoerter, Cloud-Konto, Addons, Items und Regeln stehen; nur der
   Wechselrichter-Schritt wartet, weil `02b` das Geraet nicht findet
   (Phase `wartet_auf_wechselrichter`, danach Sammelphase
   `unvollstaendig` mit den offenen Schritten). Das ist der gewollte
   Endzustand des Tests, kein Fehler.
4. Pruefen: `ssh openhabian@<tunnel-ip>` von s1 aus (Fernwartung) und
   Anmeldung auf <https://remote.hac.ischlstrom.org> mit dem Cloud-Konto.
5. Pi herunterfahren und ans Mitglied uebergeben (gleiches Netz wie der
   Wechselrichter). `ibm-firstboot` wiederholt den Lauf alle 10 Minuten,
   findet den Wechselrichter und fuehrt die Einrichtung bis `fertig`.
   Das **Wechselrichter-Passwort** (GEN24) traegt das Mitglied erst nach
   der Uebergabe im Mitgliederbereich ein; die Auslieferung laeuft ueber
   das Status-Token, der Provisionierungs-Code wird dafuer nicht mehr
   gebraucht (er darf zu dem Zeitpunkt auch abgelaufen sein).

Was bei der Provisionierung anders ist als am klassischen Weg: das
openHAB-Admin-Konto legt `02b` selbst ueber die Karaf-Konsole an
(`OH_ADMIN_USER`/`OH_ADMIN_PASSWORD`, gleiches Passwort wie der
Linux-Benutzer `openhabian`); `07-myopenhab.sh` schreibt UUID und Secret
vom Server nach `userdata/uuid` und `userdata/openhabcloud/secret` (Neustart
von openHAB, weil die UUID nur beim Start gelesen wird) statt sie anzuzeigen;
`08-install-wireguard.sh` meldet den Public-Key an den Server statt ihn
anzuzeigen und wartet bis zu drei Minuten auf den Handshake; der
Hauptschalter steht danach auf `ON` (`DEFAULT_MAIN_SWITCH`); die Startseite
der Main UI begruesst das Mitglied mit Vornamen ("Hallo Helga" statt
"Uebersicht"): der eingebaute Navbar-Titel ist ein fester i18n-Text,
deshalb blendet die Home-Seite die Navbar aus (`hideNavbar`) und die
Overview-Seite zeigt eine eigene Kopfzeile mit Datum und Begruessung
(`IBM_MEMBER_FIRSTNAME` vom Server, eingesetzt von
`05-install-overview.sh`; ohne Vornamen steht dort "Uebersicht"). Nach
erfolgreichem Lauf loescht `ibm-firstboot` die `ibm-provision.conf` von der
Karte und setzt `/var/lib/ischlstrom/provisioned`; der Code ist ab Phase
`fertig` ungueltig (neuer Code: Dashboard, "Neuer Code"). Alle Zugangsdaten
(Linux/Admin, Cloud-Konto, UUID/Secret) stehen am Dashboard, das
Cloud-Konto auch im Mitgliederbereich.

Die Schrittfolge von `install-ibm.sh` ist seit der Provisionierung fuer
alle Wege gleich: zuerst, was keinen Wechselrichter braucht (Fernwartung,
Passwoerter, Cloud-Identitaet, Addons), damit die Anlage fuer den Vorstand
erreichbar ist, selbst wenn es beim Wechselrichter haengt; danach Preflight,
Things, Items, Regeln, Overview, Verify.

### SD-Karte defekt (Restore)

Alle Einstellungen einer Anlage liegen am Server, nicht auf der Karte -
eine defekte Karte wird einfach neu bespielt: am Dashboard **"Neuer
Code"** (der alte ist seit Phase `fertig` ungueltig), dann **"Image
erstellen"** und die neue Karte flashen (oder Zip + `prepare-sd.sh`).
Beim ersten Start laeuft dieselbe Zero-Touch-Einrichtung noch einmal
durch; Tunnel-IP, Cloud-Konto, UUID/Secret und Passwoerter bleiben wie
gehabt (den neuen WireGuard-Schluessel meldet der Pi selbst, der
s1-Timer tauscht den Peer aus). Nur das **Wechselrichter-Passwort** muss
neu hinterlegt werden (Dashboard oder Mitgliederbereich), weil der
Server es nach einmaliger Auslieferung loescht. Lokale Historie am Pi
(openHAB-Persistence) geht verloren; die Community-Daten liegen ohnehin
auf s1.

### Aktionen am Dashboard

Das Mitglied wird per Namenssuche gewaehlt ("SD-Karte vorbereiten");
danach bietet das Dashboard je Anlage:

- **Zip herunterladen**: `sd-<nnn>.zip` fuer `prepare-sd.sh`.
- **Image erstellen** / **Image herunterladen**: fertiges `pi-<nnn>.img.gz`
  vom Server. Der Hinweis "mit einem alten oder abgelaufenen Code gebaut"
  bedeutet: das Image passt nicht mehr zum aktuellen Code, vor dem Flashen
  also "Image neu erstellen".
- **Neuer Code**: neuer Provisionierungs-Code (der alte wird ungueltig).
- **Neues Cloud-Passwort**: setzt das Passwort des Cloud-Kontos neu.
- **Cloud-Konto erneut** / **Mail-Alias erneut**: wiederholt das Anlegen
  nach einem Fehler.
- **Profil setzen**: Wechselrichter-Profil vorgeben oder korrigieren.
- **Wechselrichter-Passwort** hinterlegen (der Server liefert es einmalig
  an den Pi aus und loescht es danach).
- **Passwoerter anzeigen**: Linux-/Admin-Passwort, Cloud-Konto und
  UUID/Secret.
- **Anlage loeschen** / **Loeschen zuruecknehmen**: das Loeschen ist
  zweistufig. Die Website markiert die Anlage nur (`setup_phase =
  'geloescht'`; Code und Wechselrichter-Passwort sind sofort weg, das
  Cloud-Konto steht auf `delete`); der s1-Timer `ibm-provision-sync`
  entfernt dann WireGuard-Peer und Cloud-Konto und danach die DB-Zeile.
  Solange der Timer die Zeile noch nicht entfernt hat, laesst sich das
  Loeschen zuruecknehmen (Peer bleibt bzw. wird wieder eingetragen, das
  Cloud-Konto wird neu angelegt, neuer Code). Nur ein reines Status-Token
  ohne Peer und Cloud-Konto wird sofort geloescht.

## Ablauf beim Kunden (klassischer Weg)

1. openHABian-Image auf die SD-Karte flashen, Pi starten, Ersteinrichtung
   abwarten (dauert beim ersten Boot einige Minuten).
2. In der Main UI (http://openhabian:8080) das Admin-Konto anlegen; die
   restlichen Fragen des UI-Assistenten koennen uebersprungen werden -
   Sprache, Region und Zeitzone setzt die Installation selbst.
3. Per SSH einloggen und:

   ```bash
   curl -fsSL https://ischlstrom.org/ibm/install.sh -o install.sh
   sudo bash install.sh
   ```

Der Rest laeuft von selbst: das Paket wird geladen und gegen seine Pruefsumme
verifiziert, der Assistent sucht den Wechselrichter im lokalen Netz, legt
Bridge- und Wechselrichter-Thing samt Zugangsdaten in openHAB an und
verknuepft die Batterie-Items - abgefragt wird nur, was das Setup nicht
selbst herausfinden kann (im Normalfall: die Zugangsdaten des
Wechselrichters und die gewuenschten Optionen). Ein bereits vorhandenes
Thing wird erkannt und weiterverwendet (siehe
[Wechselrichter automatisch anlegen](#wechselrichter-automatisch-anlegen)).
Wurde openHAB Cloud gewuenscht, zeigt die Installation am Ende UUID und
Secret fuer die Registrierung auf der ISCHLSTROM-Cloud an (siehe
[openHAB Cloud](#openhab-cloud-hacischlstromorg)).

Die Kurzform funktioniert ebenfalls: die Abfragen lesen von `/dev/tty`, nicht
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
| `IBM_PROVISION_CODE` | aus `/boot/firmware/ibm-provision.conf` | Provisionierungs-Code (Zero-Touch); setzt `IBM_ASSUME_YES=1` |

Bei einer erneuten Installation wird das alte Verzeichnis nach
`openhab.bak-<zeitstempel>` gesichert und eine vorhandene `ibm.conf`
uebernommen: ein Update aendert bestehende Einstellungen der Anlage also
nicht. **Neue Konfig-Schluessel ergaenzt das Update aber automatisch**
(`migrate_config` in `lib/common.sh`, laeuft bei jedem `load_config`):
Schluessel, die in der uebernommenen `ibm.conf` noch gar nicht vorkommen,
werden mit dem Wert eingetragen, den der Assistent heute vorgeben wuerde:
bei der automatischen Einrichtung der Standard-Itemname aus dem
Wechselrichter-Profil, am klassischen Weg das bereits verknuepfte Item.
Ein vorhandener, bewusst leer gesetzter Schluessel bleibt unangetastet.
Aendert sich der **Vorgabewert** eines bestehenden Schluessels, zieht
`migrate_config_default` ihn nach, aber nur, wenn der Schluessel noch
exakt auf dem frueheren Standard steht (ein bewusst angepasster Wert
bleibt unangetastet); so wurde etwa der Status-Push-Zeitplan von alle
5 Minuten auf minuetlich umgestellt. Manuelles Nachtragen in der
`ibm.conf` ist damit nicht noetig; nur was eine Rueckfrage braucht (etwa
das Status-Push-Token), fragt der jeweilige Schritt beim Update selbst
nach. Wer neue Schluessel einfuehrt (oder Vorgaben aendert), ergaenzt sie
in `migrate_config`.

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
Pruefsumme sind gitignored: sie werden bei jedem Release neu gebaut.
Die Endung ist bewusst `.tgz`: Dateien auf `*.gz` liefert der Static-Server
(sirv) mit `Content-Encoding: gzip` aus, Clients ohne `Accept-Encoding`
bekaemen dann das entpackte Tar und die Pruefsumme schluege fehl.

Der Bootstrap `website/static/ibm/install.sh` ist dagegen eine gepflegte
Quelldatei im Repository und wird nicht generiert.

`build-dist.sh` braucht `python3` mit PyYAML (`sudo apt install python3-yaml`),
um die Overview-Seiten der Profile nach `overview.page.json` zu wandeln.

## Die einzelnen Schritte

`install-ibm.sh` fuehrt sie der Reihe nach aus; jedes laeuft auch einzeln.
Die Tabelle ist nach Skriptnamen sortiert; die tatsaechliche Reihenfolge
von `install-ibm.sh` ist: Konfiguration (`00-provision.sh` bei vorhandenem
Provisionierungs-Code, sonst `00-wizard.sh`), Regionaleinstellungen, `08`
(WireGuard), `10` (Passwoerter), `07` (Cloud-Identitaet, nur wenn eine
`CLOUD_UUID` vom Server vorliegt), `02` (Addons), `01` (Preflight), `02b`,
`03`, `04`, `05`, `06` und zuletzt `07` (klassische Registrierung, nur ohne
Provisionierung).

| Skript | Wirkung |
| --- | --- |
| `00-provision.sh` | Zero-Touch: loest den Provisionierungs-Code bei ischlstrom.org ein, erkennt das Wechselrichter-Profil (Netzsuche aller Profile, bei Mehrdeutigkeit Phase `wechselrichter_unklar` und Wahl am Dashboard) und schreibt `ibm.conf`. Exit 75 = Server nicht erreichbar, spaeter erneut. |
| `00-wizard.sh` | Fragt die Anlagendaten ab und schreibt `ibm.conf`. Erkennt ein vorhandenes Thing samt Items selbst; fehlt das Thing, sucht er den Wechselrichter im Netz und laesst ihn von `02b` automatisch anlegen. |
| `01-preflight.sh` | Prueft Dienst, Quellskripte, API, Thing, Item und Item-Kollisionen. Aendert nichts. |
| `02-install-addons.sh` | Traegt Binding, `jsscripting`, `mapdb`, `rrd4j` und (falls gewuenscht) `openhabcloud` in `addons.cfg` ein. |
| `02b-install-things.sh` | Legt Bridge- und Wechselrichter-Thing per REST API an und erzeugt bei Bedarf das API-Token ueber die Karaf-Konsole (siehe [Wechselrichter automatisch anlegen](#wechselrichter-automatisch-anlegen)). |
| `03-install-items.sh` | Schreibt `items/ibm.items` sowie `persistence/mapdb.persist` (Einstellungen, `restoreOnStartup`) und `persistence/rrd4j.persist` (Zeitreihen fuer Analyze/Diagramme), setzt `rrd4j` als Standard-Persistence-Dienst und wartet, bis openHAB die Dienste installiert und die Modelle wirklich angewendet hat. Bei der automatischen Einrichtung inklusive der Batterie-Items samt Channel-Verknuepfung. |
| `04-install-rules.sh` | Erzeugt die zeitgesteuerten Regeln in `automation/js/` und (falls gewuenscht) den Netzwerk-Watchdog. |
| `05-install-overview.sh` | Schreibt die IBM-Seiten (Overview + Unterseiten) per REST API in die Main UI (braucht `OH_API_TOKEN`; bestehende Seiten werden vorher gesichert). |
| `06-verify.sh` | Prueft das Ergebnis, zeigt die letzten `[IBM]`-Logzeilen. Aendert nichts. |
| `07-myopenhab.sh` | Bei der Provisionierung (`CLOUD_UUID`/`CLOUD_SECRET` vom Server): schreibt UUID und Secret nach `userdata/uuid` bzw. `userdata/openhabcloud/secret` und startet openHAB bei einer Aenderung neu. Sonst: zeigt UUID und Secret fuer die Registrierung auf der ISCHLSTROM-Cloud (hac.ischlstrom.org) an (wartet ggf. auf das Cloud-Addon) und aendert nichts. |
| `08-install-wireguard.sh` | Richtet den WireGuard-Tunnel zum Wartungsserver ein und baut die SSH-Haertung aelterer Versionen zurueck - die Anmeldung durch den Tunnel laeuft per Passwort (siehe [Fernwartung](#fernwartung-wireguard)). |
| `10-change-passwords.sh` | Aendert die Standardpasswoerter des Linux-Benutzers `openhabian` und der Karaf-Konsole (siehe [Standardpasswoerter aendern](#standardpasswoerter-aendern)). |
| `purge-ibm.sh` | Entfernt das Batteriemanagement komplett wieder (Things, Regeln, Items, Seiten, Token, WireGuard, `/opt/ischlstrom`) und setzt die Anlage auf "frisches openHABian + Admin-Konto" zurueck - fuer Test-Wiederholungen oder Ausserbetriebnahme. Entfernt auch `/var/lib/ischlstrom` (Firstboot-Marker) und `/run/ibm-provision.env`, sodass die Zero-Touch-Einrichtung wiederholt werden kann. Admin-Konto, Linux-Passwort, Zeitzone und Cloud-Identitaet (UUID/Secret) bleiben. |
| `prepare-sd.sh` | Nur auf dem Entwicklungsrechner (root): schreibt die SD-Karte fuer eine provisionierte Anlage aus dem Zip des Dashboards. Schreibt das Image und kopiert `openhabian.conf`, `ibm-provision.conf` und `user-data` auf die Boot-Partition; die systemd-Unit `ibm-firstboot` installiert cloud-init aus der `user-data` beim ersten Boot am Pi. |
| `firstboot/` | `ibm-firstboot.sh` + systemd-Unit: startet nach der openHABian-Erstinstallation das Setup und wiederholt es alle 10 Minuten, bis es vollstaendig ist. |
| `build-dist.sh` | Nur auf dem Entwicklungsrechner: baut das Auslieferungspaket. |

`install-ibm.sh` setzt ausserdem die Regionaleinstellungen - das, was sonst
der Ersteinrichtungs-Assistent der Main UI erledigt (der kann also samt
seinen Fragen einfach uebersprungen werden; nur das Admin-Konto muss dort
angelegt werden): die Systemzeitzone (`timedatectl`) sowie Zeitzone, Sprache,
Region und Masssystem von openHAB (`org.openhab.i18n:*` in
`services/runtime.cfg`; diese Eintraege gehen der Main-UI-Einstellung vor).
Vorgaben: `Europe/Vienna`, `de`, `AT`, `SI` - abweichend per
Umgebungsvariable `IBM_TIMEZONE`, `IBM_LANGUAGE`, `IBM_REGION`.

Die Skripte sind **idempotent**: ein erneuter Lauf ist jederzeit gefahrlos.
Geaenderte Dateien werden vorher als `*.bak-<zeitstempel>` gesichert,
unveraenderte bleiben unangetastet.

## Wechselrichter automatisch anlegen

Findet der Assistent kein Wechselrichter-Thing, bietet er an, den
Wechselrichter komplett automatisch einzurichten - die Main UI wird dann
nur noch fuer das Anlegen des Admin-Kontos gebraucht:

1. Der Assistent sucht den Wechselrichter im lokalen /24-Netz (gleiche
   Erkennung wie der Netzwerk-Watchdog, bei Fronius der Solar-API-Endpunkt)
   und fragt - wenn das Profil welche braucht - die Zugangsdaten des Geraets
   ab (beim GEN24 noetig fuer die Batteriesteuerung). Ergebnis in
   `ibm.conf`: `AUTO_CREATE_THING=1`, `INVERTER_HOST`, `INVERTER_USERNAME`,
   `INVERTER_PASSWORD`.
2. `02b-install-things.sh` wartet, bis das Binding installiert ist, und legt
   dann die Things des Profils per REST API an: den klassischen
   Zwei-Thing-Baum (Bridge `fronius:bridge:ibm` + Wechselrichter
   `fronius:powerinverter:ibm:inverter1`) - oder, wenn das Profil ein
   eigenes Thing-Manifest mitbringt (`inverter_things_json`), genau diesen
   Baum, z. B. bei Modbus tcp-Bridge -> Poller -> Data-Things.
3. Das dafuer noetige **API-Token** erzeugt das Setup selbst: ueber die
   Karaf-Konsole (`openhab:users addApiToken <admin> ibm admin`). Das
   Konsolen-Passwort muss dafuer niemand wissen - als root wird in
   `users.properties` voruebergehend ein Zufallspasswort gesetzt und danach
   der alte Eintrag wiederhergestellt. Das Token landet als `OH_API_TOKEN`
   in `ibm.conf` und wird auch von Watchdog und Overview-Seite verwendet.
   Voraussetzung: das Admin-Konto in der Main UI existiert bereits.
4. `03-install-items.sh` legt die Batterie-Items (Ladestand, Leistung) mit
   ihrer Channel-Verknuepfung direkt in `ibm.items` an - das Verknuepfen in
   der Main UI entfaellt.

Weil `ibm.conf` damit die Zugangsdaten des Wechselrichters und das API-Token
enthaelt, schreibt der Assistent die Datei mit `chmod 600` (nur root).

Der klassische Weg bleibt erhalten: existiert schon ein Thing, wird es
erkannt und unveraendert weiterverwendet; wer die automatische Einrichtung
ablehnt, bekommt wie bisher die Anleitung fuer die Main UI.

**Nachruesten** bei bestehender Installation: `AUTO_CREATE_THING=1` und
`INVERTER_HOST` (plus Zugangsdaten) in `ibm.conf` eintragen, dann
`sudo /opt/ischlstrom/openhab/setup/02b-install-things.sh` und
`sudo /opt/ischlstrom/openhab/setup/03-install-items.sh` ausfuehren.

## Andere Wechselrichter

Es gibt fuenf mitgelieferte Profile: `fronius` (Fronius GEN24, Hybrid mit
Batterie; Batterie-Actions des Fronius-Bindings), `fronius-snapinverter`
(Fronius Symo Hybrid, SnapINverter-Generation; Modbus/SunSpec Model 124),
`sigenergy` (Sigenergy SigenStor, Modbus mit proprietaerer Registerkarte),
`deye` (Deye Hybrid SG04LP3/SG05LP3, Modbus RTU hinter einem
RS485-Ethernet-Gateway, TOU-Fahrplan) und `victron` (Victron Energy ueber
das GX-Geraet, Modbus). Alles Herstellerabhaengige steht in
`../inverters/<hersteller>/profile.sh`; der Assistent listet automatisch auf,
was dort liegt. Ein neuer Hersteller braucht **keine Aenderung an den
Setup-Skripten**, siehe [../inverters/README.md](../inverters/README.md).

Die Batteriesteuerung selbst ist zweigeteilt: die gesamte Entscheidungslogik
(Zeitfenster, Wolken, Kapazitaetsschaetzung) liegt herstellerneutral in
`../control/core.js`; das Profil liefert nur einen duennen Adapter
(`INVERTER_ADAPTER_SCRIPT`) mit den drei Funktionen `ibmReset`,
`ibmPreventCharge` und `ibmForceDischarge`. `04-install-rules.sh` setzt
Adapter und Kern in dieselbe Regel `ibm_battery_control.js`.

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
| `Ischlstrom_Nachtbudget` / `_Zeit` | String | Nacht-Entladebudget in kWh (Token-API) oder `-`, samt Abrufzeitpunkt |
| `Ischlstrom_Entladestart` | String | Entladestart der Nacht aus der Tagesprognose (Token-API), `HH:MM` oder `-` |
| `Ischlstrom_Wolken_Stunden` | String | Stuendliche Bewoelkung des restlichen Tages (JSON, Wolken-API) |
| `Ischlstrom_Ladefaktoren` | String | Stuendliche Ladefaktoren des Erzeugungsprofils samt Abend-Deadline (JSON, Token-API) |
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
| `IBM_LADEREGELUNG` | Switch | Ladeleistung dynamisch regeln statt Sperrfenster (siehe unten) |
| `IBM_LADEREGELUNG_SOLL` | String | Ziel-Ladeleistung der Regelung, `<watt> W` oder `-` |
| `IBM_LADEREGELUNG_STATUS` | String | Interner PWM-Zustand der Laderegelung (JSON) |
| `IBM_RESTLADEZEIT` | String | Effektive (sonnengewichtete) Restladezeit bis zur Abend-Deadline, `<stunden> h` oder `-` |
| `IBM_NETZLADESCHUTZ` | Switch | Netzladeschutz: erkannte Netto-Netzladung sperrt das Laden (siehe unten) |
| `IBM_NETZLADUNG` | Number | Aktuelle Netto-Ladung der Batterie aus dem Netz in W (0 = in Ordnung) |
| `IBM_NETZLADE_WAECHTER` | String | Interner Zustand des Netzladeschutzes (JSON) |
| `IBM_BATTERIE_NETZEINSPEISUNG_KWH` | Number | Einspeise-Zaehler: aufsummierte Energie aus der Batterie ins Netz in kWh (Nutzen-Indikator, Anzeige/Status-Push) |
| `IBM_NETZEINSPEISUNG_ZAEHLER` | String | Interner Zustand des Einspeise-Zaehlers (JSON, praeziser Stand samt Zeitstempel) |

Das Entladefenster endet beim morgendlichen Crossover der Gemeinschaft
(`Ischlstrom_Crossover_Start`, Wochenmittel). Der Beginn kommt tagesaktuell
aus der Prognose (`Ischlstrom_Entladestart`, Token-API): der erste
15-Minuten-Slot nach dem abendlichen Crossover, in dem das Defizit der
Gemeinschaft mindestens ein Viertel ihres Verbrauchs und mindestens das
Doppelte der Entladeleistung aller IBM-Anlagen erreicht. Erst dann nehmen
die Mitglieder die Einspeisung sicher auf; direkt nach dem Crossover (und
erst recht nach dem Wochenmittel `Ischlstrom_Crossover_Ende`, das an
sonnigen Tagen zu frueh liegt) ginge sie an den Energielieferanten. Fehlt
der Wert oder gilt er nicht fuer den heutigen Tag (`Ischlstrom_Ladesperre_Datum`),
beginnt die Entladung eine Stunde nach dem abendlichen Crossover
(`DISCHARGE_START_OFFSET_MIN` in `control/core.js`). Liegen keine plausiblen
Crossover-Zeiten vor (ischlstrom.org nie erreichbar gewesen oder Werte
unbrauchbar), wird **nicht** entladen - ein Ersatz-Zeitfenster gibt es nicht.

Wie tief nachts entladen wird, begrenzt das **Nacht-Entladebudget**
(`Ischlstrom_Nachtbudget`, Token-API): was der kommende Tag laut Prognose
wieder in die Batterie laedt, abzueglich Hauslast-Reserve und Abschlag. Der
Server rechnet dafuer mit der hoeheren von gelernter Ladeleistung
(`IBM_LADELEISTUNG`, bewusst die untere Huellkurve) und der aus der
Status-Historie beobachteten Spitzen-Ladeleistung der Anlage - die gelernte
Rate allein wuerde das Budget an sonnigen Tagen auf einen Bruchteil
druecken, weil sie oberhalb von 95% Ladestand und unter der Laderegelung
keine Stichproben bekommt.

Das Ladesperre-Fenster kommt aus der Tagesprognose
(`/api/eeginfo/ladefenster/v1`, berechnet aus den Kurven von `/vorhersage`):
gesperrt wird vom ersten Sonnenschein bis in die Mittagsspitze des
Ueberschusses. Das Ende ist der spaetere von Vormittags-Crossover und dem
Zeitpunkt, an dem der Ueberschuss 75% seines Tagesmaximums erreicht -
gekappt am Slot des Ueberschussmaximums und um 14:00. Die morgendliche Verbrauchsspitze
der Gemeinschaft wird so direkt aus der PV gedeckt, und die Batterien laden
mitten in der Ueberschussspitze statt direkt nach dem Crossover: das haelt
die Gemeinschaft nach dem Crossover im Plus, faengt Abregelungsverluste und
verkuerzt die Standzeit bei 100% Ladung. Geladen wird wie immer
ausschliesslich aus der eigenen PV-Anlage, nie aus dem Netz oder von anderen
Mitgliedern. Das Fenster gilt nur fuer das mitgelieferte Datum
(`Ischlstrom_Ladesperre_Datum`); ist es veraltet, unplausibel oder liefert
die Prognose keinen Ueberschuss (`-`), wird nicht gesperrt. Die
Wolken-Schwelle bleibt als zusaetzliche Bedingung bestehen: gesperrt wird nur
bei sonniger Vorschau. Die Wolkenvorschau gilt als veraltet, wenn ihr
letzter Abruf (`Ischlstrom_Wolkenvorschau_Zeit`) laenger als drei Stunden
zurueckliegt: die Steuerung sperrt dann kein Laden und entlaedt nur mit
minimaler Leistung.

### Dynamische Laderegelung (ersetzt das Sperrfenster)

Sobald die Anlage ihre Batteriekapazitaet und Ladeleistung belastbar
geschaetzt hat, ersetzt ein geschlossener Regelkreis das harte Sperrfenster
(`IBM_LADEREGELUNG`, Vorgabe `ON`): In jedem 5-Minuten-Zyklus berechnet die
Steuerung die **Ziel-Ladeleistung** neu: fehlende Energie (bis 95%
Ladestand) geteilt durch die **effektive Restladezeit** bis eine Stunde vor
dem abendlichen Crossover. Die Restzeit ist sonnengewichtet: jede
verbleibende Stunde zaehlt nur mit ihrem erwarteten Ertrag, bevorzugt aus
den stuendlichen Ladefaktoren des Erzeugungsprofils (Token-API, exakt
inklusive Sonnenstand), sonst aus den stuendlichen Bewoelkungswerten der
Wolken-API (Faktor 1 minus Wolken/100). Der aktuelle Wert steht in
`IBM_RESTLADEZEIT` (Karte auf der Laden-Seite, Status-Push an das
Dashboard). Nur wenn beides fehlt (aelterer Server), zaehlt jede Stunde
gleich und ein wolkenabhaengiger Sicherheitsfaktor (1,1 bei klarem Himmel
bis 1,6 bei 100% Bewoelkung) gleicht den Nachmittagsabfall pauschal aus.
Die Batterie laedt so den ganzen Tag gerade schnell genug, um am Abend voll
zu sein; der gesamte restliche PV-Ueberschuss fliesst laufend in die
Gemeinschaft statt erst nach einem Sperr-Ende. Weil auf den
**Live-Ladestand** geregelt wird, korrigieren sich Prognosefehler von
selbst: zieht es zu, bleibt der Ladestand zurueck, die Ziel-Leistung steigt
und die Begrenzung loest sich.

Umgesetzt wird die Begrenzung je nach Wechselrichter: Definiert der Adapter
die optionale Funktion `ibmLimitCharge` (SunSpec-/Victron-Profile), wird die
Ziel-Leistung direkt kommandiert. Sonst bildet eine Puls-Weiten-Modulation
sie nach: gesperrte und freie **15-Minuten-Bloecke** im passenden
Verhaeltnis ergeben im Mittel die Ziel-Leistung; eine Hysterese verhindert
Flattern an den Blockgrenzen, und mehr als 90% der Slots werden nie
gesperrt: ein Schaetzfehler kann das Laden also nie ganz wuergen. Das
aktuelle Soll steht in `IBM_LADEREGELUNG_SOLL` (`-` = keine Begrenzung) und
geht mit dem Status-Push an das Vorstands-Dashboard.

Alle Sicherungen des Sperrfensters gelten unveraendert: eingegriffen wird
nur bei gueltigem Tagesfenster (Datum, erster Sonnenschein) und frischer,
sonniger Wolkenvorschau. Der Truebe-Waechter verwendet dabei bevorzugt die
mittlere Bewoelkung der **Reststunden bis zur Deadline** (aus
`Ischlstrom_Wolken_Stunden`); nur ohne Stundendaten die
Mittagsfenster-Vorschau, die ab 12:00 bereits den morgigen Tag meint.
Fehlt eine Voraussetzung (auch die Schaetzungen auf einer frisch
installierten Anlage), gilt automatisch das klassische Sperrfenster mit
Server-/Lokal-Ende als Rueckfall; bei `IBM_LADEREGELUNG=OFF` dauerhaft.

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
Messung neu auf. Eine typische Nacht liefert mehrere Stichproben: die
Schaetzung ist also meist schon nach der ersten Nacht belastbar.

Ab drei akzeptierten Stichproben leitet die Steuerung die Entladeleistung als
C-Rate aus der Schaetzung ab: minimal 0,1 C, maximal 0,3 C (eine
10-kWh-Batterie speist also wie bisher mit 1000 bis 3000 W ein, eine 5-kWh-Batterie
mit 500 bis 1500 W). Die Items `Minimale_/Maximale_Entladeleistung_...` bleiben der
Rueckfall, solange keine belastbare Schaetzung vorliegt oder
`IBM_DYNAMISCHE_LEISTUNG` auf `OFF` steht. Unabhaengig davon gilt eine **harte
Obergrenze von 5000 W** (`ABSOLUTE_MAX_DISCHARGE_W` im Steuerungsskript), die
weder durch Einstellungen noch durch die Schaetzung ueberschritten werden kann.

Die Schaetzung nutzt die kommandierte Leistung, nicht eine Messung: zieht der
Haushalt nachts mehr, als kommandiert ist, faellt die Schaetzung etwas zu
klein aus. Das ist gewollt konservativ: die abgeleitete Leistung ist dann eher
zu niedrig als zu hoch.

Das Ladestands-Item und das Batterieleistungs-Item werden **nicht** angelegt:
sie entstehen beim Verknuepfen der Channels in der Main UI und werden ueber
`SOC_ITEM` bzw. `BATTERY_POWER_ITEM` nur referenziert (letzteres liefert in
der Hero-Karte der Overview den Wert "Batterie laedt/entlaedt").

Die Startwerte dieser Items stehen in `ibm.conf` (`DEFAULT_*`) und werden von
`ibm_init.js` gesetzt, solange ein Item noch `NULL` ist. Danach ist alles in
der Main UI aenderbar: **das Steuerungsskript wird pro Kunde nie angepasst**.

**Main-UI-Seiten:** Die Seiten fuer die Main UI liegen je Profil in
`../inverters/<profil>/overview.yaml` (Referenz ist `fronius/`, die anderen
sind davon abgeleitet und unterscheiden sich nur in den Item-Namen des
Wechselrichters und den Werten der Hero-Karte). Gebaut fuer das Smartphone
in der openHAB-App: alles einspaltig, Listen statt nebeneinander
gequetschter Karten. Die Overview zeigt oben eine Hero-Karte (Ladestand als
Halbkreis-Anzeige, Batterieleistung, Netzeinspeisung sofern das Profil ein
Netzleistungs-Item hat, IBM-Status; Tippen oeffnet den Verlauf), darunter
die Tageszeiten der Gemeinschaft (Ueberschuss ab/bis, Nachtbudget), den
Hauptschalter und die Navigation zu vier Unterseiten (`ibm_laden`,
`ibm_einspeisen`, `ibm_pause`, `ibm_experten`) mit Status-Badges (Ein/Aus,
verbleibende Pausentage) und eine aufklappbare Erklaerung. In allen
sichtbaren Texten heisst die Steuerung "Speichermanagement" - das Kuerzel
IBM bleibt intern (Item-Namen, Skripte, Doku) und erscheint nie in der UI.
Die Laden-Seite zeigt bewusst nur den Hauptschalter "Intelligentes Laden"
(`IBM_LADESPERRE_AKTIV`) und die Werte der Regelung (Ziel-Ladeleistung,
effektive Restladezeit); alle Bedienelemente des klassischen Sperrfensters
(`IBM_LADEREGELUNG`, `IBM_LADESPERRE_LOKAL`, Sperrzeiten,
Bewoelkungs-Schwelle) liegen als Block "Notfallplan Laden (Sperrfenster)"
auf der Expertenseite. Die Einspeisen-Seite zeigt als "Einspeisung ab" den
tagesaktuellen Entladestart (`Ischlstrom_Entladestart`), wenn einer
vorliegt, sonst den Abend-Crossover. Die Seite `home` braucht ein `label`:
ohne bricht die Seitenliste der Main UI (5.0) mit einem Fehler ab.
Die Seiten liegen in der JSONDB, deshalb installiert `05-install-overview.sh` sie per
REST API. Dafuer wird das openHAB-API-Token gebraucht (`OH_API_TOKEN`, fragt
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
| `ibm_battery_control.js` | Adapter des Profils + `../control/core.js` | alle 5 Minuten |
| `ibm_status_push.js` (optional) | `../eeg-api/status_push.js` | jede Minute (voller Zustand alle 5 Minuten) |
| `ibm_init.js` | generiert | alle 10 Minuten |
| `ibm_pause.js` | generiert | taeglich 00:30 |
| `ibm_watchdog.js` (optional) | generiert | bei Bridge-OFFLINE + alle 15 Minuten |

## Status-Push (Vorstands-Dashboard)

Auf Wunsch (Frage im Assistenten, `INSTALL_STATUS_PUSH=1`) meldet die Anlage
**jede Minute** ihren Zustand an `<IBM_API_BASE>/api/ibm/status/v1`: der
Vorstand sieht alle Anlagen dann live unter
<https://ischlstrom.org/board/openhab> (Ladestand, Wechselrichter-Status,
Schalterstellungen, geschaetzte Kapazitaet, letzte Meldung). Minuetlich
gehen nur die Momentanwerte (billige Item-Reads); der **volle Zustand**
(Log, Versionen, apt-Updates, Systemwerte: die Sammler starten Prozesse
auf dem Pi) geht in der Minute 2 jedes 5-Minuten-Rasters mit. Der Server
erkennt volle Meldungen am Feld `versions`, mischt schlanke Meldungen in
den letzten Stand und schreibt nur volle Meldungen in die Verlaufstabelle:
die Diagramme und das Tabellenwachstum bleiben also im 5-Minuten-Raster.
Bei Bestandsanlagen ersetzt `migrate_config` beim Paket-Update den alten
5-Minuten-Standard (`CRON_STATUS="0 2/5 * * * ?"`) automatisch durch den
minuetlichen; ein bewusst angepasster eigener Zeitplan bleibt unangetastet.
Die
**Momentanwerte** (PV-Leistung, Netzleistung, Batterieleistung) kommen aus
den Items `PV_POWER_ITEM`, `GRID_POWER_ITEM` und `BATTERY_POWER_ITEM` der
`ibm.conf` (bei der automatischen Einrichtung legt `03-install-items.sh`
sie samt Channel-Verknuepfung an); fehlt eines, versucht es der Push unter
dem Fronius-Standardnamen, sonst zeigt die jeweilige Kachel "-". Zusaetzlich
gehen die **Fehler und Warnungen** aus dem openHAB-Log der letzten
24 Stunden mit (`WARN`/`ERROR`-Zeilen aus `/var/log/openhab/openhab.log`,
hoechstens 20 Eintraege, Meldungstext gekuerzt). Das Dashboard zeigt sie
auf der Detailseite der Anlage, die Uebersicht zaehlt sie je Anlage.
Ausserdem meldet die Anlage ihre **Versionsstaende**: den Stand des
IBM-Pakets (aus der BUILD-INFO, beim Rendern der Regel gestempelt:
so erkennt der Vorstand Anlagen mit veraltetem Paket), die
openHAB-Version, die Java-Runtime und das Betriebssystem. Dazu kommt die
Zahl der **ausstehenden apt-Updates** (per `apt-get -s dist-upgrade`
aus dem lokalen Paket-Cache, samt Stand der Paketlisten). Damit die Zahl
aktuell bleibt, aktiviert das Setup ein taegliches `apt-get update` ueber
die Debian-eigene apt-daily-Mechanik (`/etc/apt/apt.conf.d/02ibm-periodic`,
`APT::Periodic::Update-Package-Lists`). **Sicherheitsupdates spielt die
Anlage automatisch ein**: das Setup installiert `unattended-upgrades` und
aktiviert es (`APT::Periodic::Unattended-Upgrade`) in der
Debian-Standardkonfiguration: nur Pakete aus dem Debian-Security-Archiv,
kein automatischer Reboot. openHAB selbst und die Pi-Firmware kommen aus
anderen Repositories und werden nie automatisch aktualisiert; was das
Dashboard als "ausstehend" zeigt, sind genau diese manuellen Updates.
Schliesslich meldet die Anlage ihren **Systemzustand**: CPU-Temperatur und
das throttled-Register des Pi (erkennt Unterspannung durch schwache
Netzteile und Drosselung), Fuellstand der SD-Karte, Boot-Zeitpunkt,
RAM-/Swap-Auslastung, ob nach einem Kernel-Update ein Reboot aussteht und
wann unattended-upgrades zuletzt gelaufen ist.
Uebertragen werden ausschliesslich diese IBM-Betriebsdaten, Logmeldungen,
Versionsstaende, Update-Zaehler und Systemwerte, keine Verbrauchsdaten des
Haushalts.

Die Anlage authentifiziert sich mit einem **Status-Token**, das der Vorstand
**vor der Installation** auf <https://ischlstrom.org/board/openhab> fuer das
Mitglied erzeugt (Abschnitt "Tokens"). Der Assistent fragt das Token ab und
legt es als `IBM_STATUS_TOKEN` in der `ibm.conf` ab; dazu kommt der
Anzeigename `IBM_ANLAGE_NAME` (Vorgabe: Hostname). Meldungen mit unbekanntem
Token weist der Server ab. Auf dem Server liegen die Tokens in der Tabelle
`members_openhabstatus`; **Loeschen auf dem Dashboard widerruft das Token**,
die Anlage kann dann nicht mehr melden, bis ein neues Token eingetragen wird.
Ein reines Token ohne WireGuard-Peer und Cloud-Konto wird dabei sofort
geloescht; eine provisionierte Anlage zweistufig ueber den s1-Timer (siehe
[Aktionen am Dashboard](#aktionen-am-dashboard)).

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
nach einer Stunde). Es eignet sich damit auch als einfache
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

Der Watchdog braucht ein **openHAB-API-Token** eines Admin-Benutzers. Im
Normalfall erzeugt das Setup es selbst (`OH_API_TOKEN=auto`, die Vorgabe
des Assistenten): ueber die Karaf-Konsole wird ein Token namens `ibm` fuer
den ersten Admin-Benutzer angelegt (`ensure_api_token` in `lib/common.sh`).
Nur als Rueckfall, wenn das fehlschlaegt, wird ein von Hand erzeugtes Token
eingetragen (Main UI -> links unten auf den Benutzernamen klicken ->
"Create new API token"). Ohne Token wird der Watchdog
uebersprungen und kann spaeter nachgeruestet werden: `INSTALL_WATCHDOG=1`,
`INVERTER_HOST_THING_UID` und `OH_API_TOKEN` in `ibm.conf` eintragen, dann
`04-install-rules.sh` erneut ausfuehren. Das Token liegt danach in
`/var/lib/openhab/ibm/api_token` (nur fuer den openhab-Benutzer lesbar).

Manueller Testlauf (auch bei `ONLINE`, erzwingt die Suche):

```bash
sudo -u openhab /etc/openhab/scripts/ibm_rediscover.sh --force
```

Alle Meldungen erscheinen mit dem Praefix `[IBM][Watchdog]` im openhab.log.

## openHAB Cloud (hac.ischlstrom.org)

Auf Wunsch (Frage im Assistenten, `INSTALL_CLOUD=1`) richtet das Setup den
**openHAB Cloud Connector** ein, verbunden mit der **eigenen
openHAB-Cloud-Instanz der Gemeinschaft** unter `https://hac.ischlstrom.org`
(selbst gehostete openHAB Cloud auf s1, ersetzt myopenhab.org).
`02-install-addons.sh` setzt dafuer die `baseURL` in
`services/openhabcloud.cfg`; bei Bestandsanlagen stellt ein Paket-Update
die Anlage damit auf die eigene Cloud um: das Konto des Mitglieds muss
dann dort registriert sein, sonst ist die Anlage aus der Ferne nicht mehr
erreichbar. Damit ist die Main UI von unterwegs unter
`https://remote.hac.ischlstrom.org` erreichbar und die Anlage kann
Benachrichtigungen an die openHAB-App schicken (in der App als Remote-URL
`https://hac.ischlstrom.org` eintragen).

**Zero-Touch (Standardweg):** Bei der Provisionierung erzeugt der Server
UUID und Secret und liefert sie mit dem Provisionierungs-Code aus;
`07-myopenhab.sh` schreibt sie nach `userdata/uuid` und
`userdata/openhabcloud/secret` (Neustart von openHAB bei einer Aenderung).
Das Cloud-Konto (Benutzer `<nnn>@ischlstrom.org`) legt der s1-Timer
`ibm-provision-sync` schon vorab an; die Zugangsdaten stehen im
Mitgliederbereich (Speichermanagement) und am Dashboard. Eine
Registrierung von Hand entfaellt.

**Manuelle Registrierung (Rueckfall fuer den klassischen Weg):** Dafuer
braucht die Cloud zwei Werte der Installation:

| Wert | Datei auf dem Pi |
| --- | --- |
| UUID | `/var/lib/openhab/uuid` (legt openHAB beim ersten Start an) |
| Secret | `/var/lib/openhab/openhabcloud/secret` (entsteht beim ersten Start des Cloud-Addons) |

Am klassischen Weg wartet `07-myopenhab.sh` auf das Secret (die
Addon-Installation ueber `addons.cfg` kann einige Minuten dauern) und zeigt
dann beide Werte mit der Anleitung an. Jederzeit erneut abrufbar:

```bash
sudo /opt/ischlstrom/openhab/setup/07-myopenhab.sh
```

Registrierung: auf <https://hac.ischlstrom.org> ueber *Register* ein Konto
anlegen (E-Mail-Adresse und Passwort des Mitglieds) und dabei UUID und
Secret eintragen (beides ist spaeter unter *Account* aenderbar). Sobald die
Anlage verbunden ist, zeigt die Cloud sie als *Online*; falls nicht, openHAB
einmal neu starten (`sudo systemctl restart openhab.service`).

Standardmaessig werden dabei **keine Items** zur Cloud uebertragen
(exponiert). Die Verbindung dient nur dem Fernzugriff auf die UI und den
Benachrichtigungen.

Die Cloud-Instanz selbst laeuft als Docker-Stack auf s1
(`/home/martin/openhab-cloud/deployment/docker-compose/`, offizielles Image
`openhab/openhab-cloud`), hinter Caddy; `hac.ischlstrom.org` ist die
Website samt REST-Schnittstelle fuer App und Connector,
`remote.hac.ischlstrom.org` der Proxy-Host fuer den Fernzugriff auf die
Main UI (Basic Auth mit dem Cloud-Konto).

## Fernwartung (WireGuard)

Nach der Installation beim Mitglied gibt es keinen direkten SSH-Zugang mehr
zum Pi. Auf Wunsch (Frage im Assistenten, `INSTALL_WIREGUARD=1`) richtet
`08-install-wireguard.sh` deshalb einen **ausgehenden WireGuard-Tunnel** zum
Wartungsserver ein. Der Pi haelt die Verbindung selbst offen
(`PersistentKeepalive`), am Router des Mitglieds muss nichts geoeffnet
werden, und durch den Tunnel laeuft ausschliesslich das Wartungsnetz
(`10.88.0.0/24`). Der normale Internetverkehr bleibt unberuehrt.

**Adressplan:** Der Wartungsserver ist `10.88.0.1`, jede Anlage bekommt
eine eindeutige Tunnel-IP ab `10.88.0.11`. Bei der Provisionierung vergibt
der Server sie aus dem Pool; am klassischen Weg fragt der Assistent sie ab
(`WG_ADDRESS`).

**Registry ist die Datenbank** (`members_openhabstatus`), nicht die
`wg0.conf`: auf s1 enthaelt `/etc/wireguard/wg0.base.conf` den
`[Interface]`-Block (plus eventuell nicht zuordenbare Alt-Peers); die
`wg0.conf` erzeugt der Timer `ibm-provision-sync.sh` jede Minute neu aus
dieser Basis und den Peers der Datenbank (Handeintraege in der `wg0.conf`
werden dabei ueberschrieben). Der Pi meldet seinen Public-Key selbst an
den Server (Phasenmeldung `tunnel`), der Timer traegt ihn ein, und
`08-install-wireguard.sh` wartet bis zu 180 s auf den Handshake.
Sicherung: der Timer schreibt nie eine `wg0.conf` mit weniger Peers als
bisher, ausser die entfernten gehoeren zu geloeschten Anlagen (oder der
Marker `/etc/wireguard/ibm-allow-fewer-peers` liegt vor). Details:
`scripts/ibm-provision/` und
[docs/server-setup.md](../../../docs/server-setup.md).

### Einmalig auf dem Wartungsserver

```bash
sudo apt install wireguard
sudo bash -c 'umask 077 && wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub'
sudo ufw allow 51820/udp
sudo systemctl enable --now wg-quick@wg0
```

`/etc/wireguard/wg0.base.conf` auf dem Server (legt
`scripts/ibm-provision/setup-on-s1.sh` aus einer bestehenden `wg0.conf`
an):

```ini
[Interface]
Address    = 10.88.0.1/24
ListenPort = 51820
PrivateKey = <Inhalt von server.key>

# Die Peers traegt der Timer ibm-provision-sync aus der Datenbank in die
# generierte wg0.conf ein; hier stehen nur nicht zuordenbare Alt-Peers.
```

Danach den Public Key des Wartungsservers (`server.pub`) als
`website/static/ibm/wg-server.pub` veroeffentlichen (Datei nach
`website/static/ibm/` legen und deployen); das Setup auf dem Pi laedt ihn
von dort.

Ein frueher veroeffentlichter `ssh-maintainer.pub` wird nur noch fuer den
Rueckbau gebraucht: `08-install-wireguard.sh` erkennt daran den alten
Wartungsschluessel in den `authorized_keys` und entfernt ihn. Die Datei erst
loeschen, wenn alle Anlagen das Setup einmal neu durchlaufen haben.

### Je Anlage

Bei der Provisionierung laeuft das automatisch: der Server vergibt die
Tunnel-IP, der Pi meldet seinen Public-Key, der Timer traegt den Peer ein,
und `08-install-wireguard.sh` wartet bis zu 180 s auf den Handshake. Der
Handeintrag gilt nur noch fuer den klassischen Weg:

1. Der Assistent fragt die Tunnel-IP ab; `08-install-wireguard.sh` erzeugt
   das Schluesselpaar (`/etc/wireguard/ibm-pi.key`), schreibt die `wg0.conf`,
   startet den Tunnel und zeigt am Ende den fertigen `[Peer]`-Block an.
2. Diesen Block auf dem Wartungsserver in `/etc/wireguard/wg0.base.conf`
   eintragen (nicht in die `wg0.conf`, die wird vom Timer ueberschrieben);
   der Timer `ibm-provision-sync` uebernimmt ihn innerhalb einer Minute in
   die generierte `wg0.conf`, bestehende Tunnel bleiben verbunden.
3. Das Skript wartet auf Wunsch auf den ersten Handshake, so ist vor dem
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

## SSH-Zugang (Passwort-Anmeldung)

Die SSH-Anmeldung auf den Anlagen laeuft per **Passwort** des Benutzers
`WG_SSH_USER` (Vorgabe `openhabian`), auch fuer die Fernwartung durch den
WireGuard-Tunnel. Der Tunnel selbst ist von aussen nicht erreichbar; das
Passwort ist die zweite Huerde. Deshalb unbedingt das allgemein bekannte
Standardpasswort `openhabian:openhabian` aendern lassen (siehe
[Standardpasswoerter aendern](#standardpasswoerter-aendern)).

**Frueher** stellte ein eigenes Skript (`09-harden-ssh.sh`) die SSH-Anmeldung
auf Schluessel bzw. SSH-Zertifikate um und schaltete die Passwort-Anmeldung
ab. Das ist zurueckgebaut: `08-install-wireguard.sh` entfernt bei jedem Lauf
die Reste der Haertung, also das Drop-in
`/etc/ssh/sshd_config.d/90-ibm-hardening.conf`, die Benutzer-CA
`/etc/ssh/ibm-user-ca.pub` und den Wartungsschluessel aus den
`authorized_keys` (erkannt ueber das noch veroeffentlichte
`<IBM_API_BASE>/ibm/ssh-maintainer.pub`). Bestehende Anlagen kehren damit
beim naechsten Setup-Lauf zur Passwort-Anmeldung zurueck; von Hand geht es
mit `sudo rm /etc/ssh/sshd_config.d/90-ibm-hardening.conf` und
`sudo systemctl reload ssh`.

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

Die Dateien in `automation/js/` sind **generiert**: Aenderungen dort gehen beim
naechsten Lauf verloren; stattdessen die Quelle im Repository anpassen und ein
neues Paket veroeffentlichen.

## Warnungen

**`addons.cfg` wird massgeblich.** Sobald dort eine Kategorie (`binding`,
`automation`, `persistence`, `misc`) gesetzt ist, verwaltet die Datei diese Kategorie.
Addons derselben Kategorie, die nur ueber die Main UI installiert wurden und
nicht in der Datei stehen, koennen von openHAB entfernt werden.
`02-install-addons.sh` ergaenzt bestehende Werte deshalb, statt sie zu
ueberschreiben, legt ein Backup an und fragt vorher nach. Bei einer bereits
eingerichteten Anlage vorher `Settings -> Add-ons` pruefen, oder im
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
Fuer Analyze/Diagramme in der Main UI kommt `rrd4j` dazu (Minutenwerte der
Zahlen-Items, Standard-Persistence-Dienst).

**Ein `.persist` wirkt erst, wenn der Dienst installiert ist.** openHAB
installiert die in `addons.cfg` eingetragenen Addons asynchron; eine vorher
geschriebene `.persist`-Datei bleibt dann stumm wirkungslos (kein
`restoreOnStartup`, keine Diagramme, `GET /rest/persistence/<dienst>` liefert
404). `03` wartet deshalb auf die Installation, stoesst das Modell danach per
`touch` neu an und prueft ueber die REST API, ob die Konfiguration angekommen
ist; `06-verify.sh` prueft dasselbe.

**Die Steuerung greift in die Hardware ein.** Am klassischen Weg steht der
Hauptschalter `Schalte_ISCHLSTROM_Empfehlung_einaus` nach der Installation
auf `OFF`: erst nach dem Einschalten wird gesteuert. Bei der
Provisionierung liefert der Server `DEFAULT_MAIN_SWITCH=ON`, der
Hauptschalter steht dann von Anfang an auf `ON`.

## Fehlersuche

```bash
sudo /opt/ischlstrom/openhab/setup/06-verify.sh
tail -f /var/log/openhab/openhab.log | grep '\[IBM\]'
```

Alle Logmeldungen der IBM-Skripte sind mit `[IBM]` praefixiert.

Laeuft eine Regel nicht, in der Main UI unter `Settings -> Rules` nach dem Tag
`IBM` filtern und die Regel manuell ausfuehren: der Fehler steht dann im Log.

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
