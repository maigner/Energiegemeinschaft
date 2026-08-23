# Plan: Raspberry-Pi-Setup fuer Laien (Zero-Touch-Einrichtung)

Stand: 2026-08-23. Betrifft `Batteriemanagement/openhab/setup/` (IBM-Setup),
das Vorstands-Dashboard `/board/openhab` und die Status-API `/api/ibm/`.

**Umsetzungsstand (2026-08-23):** Stufen 1 bis 4 sind umgesetzt (Code im
Repo, noch nicht auf einem Pi durchgespielt). Betriebsdoku:
`Batteriemanagement/openhab/setup/README.md` (Abschnitt
"Zero-Touch-Einrichtung"), `docs/server-setup.md` (s1-Timer),
`docs/openhab-cloud.md`. Rollout-Stand 23. August 2026 abends: Migration
`members 0030` auf Prod, `IBM_SECRET_KEY`/`MAILCOW_*` in `website/.env.s1`,
`install-on-s1.sh` und Deploy sind erledigt; der mailcow-API-Key ist seit
23. August aktiviert (Alias-Anlage funktioniert), der erste Test-Pi
(pi-223) laeuft. Standardablauf seit 2026-08-23: Image am Dashboard bauen,
flashen und den Pi zuerst im Netz des Vorstands installieren lassen; die
Anlage endet dort absichtlich in der Wartephase (`unvollstaendig`), beim
Mitglied laeuft sie von selbst bis `fertig` (Details: Setup-README,
Abschnitt "Standardablauf"). Vorstands-Anleitung: `docs/setup/`
(LaTeX/PDF). Stufe 5 (Kit) ist offen.

Der Plan unten ist das Original der Planung und wird nicht nachgezogen;
Details darin (GET statt POST, Phasennamen, 24 Stunden Code-Gueltigkeit,
Dateinamen wie `makeuser.ts` oder `build-image.sh`) sind teils ueberholt.
Verbindlich fuer den Ist-Stand: das Setup-README und `server-setup.md`.

Abweichungen vom Plan unten: der Code gilt 60 Tage statt 24 Stunden (die
Karte kann liegen); statt eines eigenen Images installiert cloud-init (im
Raspberry-Pi-OS-Image enthalten, NoCloud-Datasource liest die
Boot-Partition) die First-Boot-Unit beim ersten Boot aus einer `user-data`
im `sd-<nnn>.zip` - die Karte braucht damit nur noch die FAT-Partition,
`prepare-sd.sh` laeuft auch auf macOS und SSH auf den Pi entfaellt ganz;
das Cloud-Konto legt ein per `docker compose exec` eingespieltes
Node-Skript an (das offizielle Image hat kein CLI); die Kommandos an den
Pi (Stufe 4, optional) sind nicht gebaut. Zusaetzlich baut die Website
auf Wunsch ein fertiges Image je Anlage ("Image erstellen" am Dashboard,
`website/src/lib/server/ibmImage.js`, Ablage im Docker-Volume
`ischlstrom-images`): Basis-Image plus die drei Boot-Dateien, per mtools
ohne Root eingespielt, als `pi-<nnn>.img.gz` fuer den Raspberry Pi
Imager - damit klappt das Kartenschreiben auch unter Windows, und eine
defekte Karte laesst sich per "Neuer Code" + neuem Image
wiederherstellen (nur das Wechselrichter-Passwort ist neu einzutragen).

## Ausgangslage

Was ein neues Mitglied heute selbst tun muss:

| # | Schritt | Laien-tauglich? |
| --- | --- | --- |
| 1 | openHABian-Image flashen, Pi starten, 15 bis 40 Minuten Erstinstallation abwarten | bedingt (keine Rueckmeldung, ob es laeuft) |
| 2 | Main UI im Browser oeffnen, Admin-Konto anlegen, Rest des UI-Assistenten ueberspringen | bedingt |
| 3 | Per **SSH** einloggen, `curl ... \| sudo bash` | **nein** |
| 4 | Rund 15 Fragen des Assistenten beantworten: Wechselrichter-Typ, Passwort des Wechselrichters, Status-Token (vom Vorstand), Tunnel-IP (vom Vorstand), Linux-Passwort, diverse Ja/Nein | **nein** |
| 5 | UUID und Secret abtippen, Konto auf hac.ischlstrom.org anlegen | bedingt |
| 6 | Hauptschalter in der Main UI einschalten | ja |

Beim Vorstand kommt Handarbeit dazu: Token auf dem Dashboard erzeugen,
Tunnel-IP vergeben, den vom Pi angezeigten `[Peer]`-Block auf s1 in die
`wg0.conf` eintragen und `wg syncconf` ausfuehren.

Die technische Basis ist dafuer schon gut: die Skripte sind idempotent,
`IBM_ASSUME_YES=1` laeuft ohne Rueckfragen, der Wechselrichter wird im Netz
gesucht und samt Things angelegt, das API-Token wird ueber die Karaf-Konsole
selbst erzeugt, und die Anlage meldet minuetlich ihren Zustand an den Server.
Es fehlt also nicht Automatisierung im Setup, sondern der **Weg der
Antworten auf den Pi** und der **Weg der Ergebnisse zurueck zum Vorstand**:
heute laufen beide ueber das Terminal und ueber Abtippen.

## Zielbild

Der Vorstand waehlt beim Vorbereiten der SD-Karte nur das Mitglied aus;
alles andere (Token, Tunnel, Cloud-Konto, Mail-Alias, Passwoerter) entsteht
automatisch. Das Mitglied bekommt ein fertiges Kit (Pi, Netzteil,
vorbereitete SD-Karte, LAN-Kabel, ein Blatt Anleitung) und tut genau drei
Dinge:

1. LAN-Kabel in den Router stecken (gleiches Netz wie der Wechselrichter).
2. Strom anstecken.
3. Auf ischlstrom.org im Mitgliederbereich zusehen, bis die Anlage "bereit"
   meldet (etwa 30 bis 45 Minuten), und dort das Passwort des
   Wechselrichters eintragen, falls das Profil eines braucht (GEN24).

Kein Terminal, kein Abtippen, kein Browserzugriff auf den Pi. Der Vorstand
legt die Anlage vorher mit einem Klick am Dashboard an und sieht dort den
Fortschritt; der Tunnel registriert sich selbst.

Die Stufen unten bauen aufeinander auf, jede ist fuer sich nuetzlich. Die
Reihenfolge ist so gewaehlt, dass zuerst die Vorstandsarbeit wegfaellt und
dann der Terminal-Schritt; das Image ist absichtlich erst Stufe 3, weil es
ohne die Stufen 1 und 2 nichts bringt.

## Stufe 1: Provisionierung am Vorstands-Dashboard (Server)

Ziel: alle Antworten, die heute der Assistent abfragt, entstehen **vor** der
Installation auf dem Server und werden dem Pi in einem Stueck geliefert.

**Neu auf `/board/openhab`: "SD-Karte vorbereiten"**

- Einzige Eingabe: das **Mitglied** (Auswahlliste). Anzeigename und
  Cloud-Konto leiten sich aus der Mitgliedsnummer ab (`pi-007`,
  `007@ischlstrom.org`). Das Wechselrichter-Profil wird nicht abgefragt,
  sondern am Pi erkannt (siehe Stufe 2); optional kann der Vorstand es hier
  vorgeben, ebenso WLAN-Zugangsdaten, falls kein LAN moeglich ist.
- Erzeugt in einem Schritt, alles in `members_openhabstatus`:
  - Status-Token (gibt es schon);
  - **Tunnel-IP aus einem Pool** (naechste freie ab `10.88.0.11`, Ende der
    Handvergabe);
  - zufaelliges Linux-Passwort fuer den Benutzer `openhabian`;
  - **openHAB-Cloud-Identitaet**: UUID (`uuidgen`) und Secret (zufaellig,
    gleiches Format wie das Addon: 20 alphanumerische Zeichen) werden
    **serverseitig erzeugt** und spaeter auf den Pi geschrieben (Stufe 2);
    openHAB liest `userdata/uuid` und das Cloud-Addon
    `userdata/openhabcloud/secret` und legen beides nur an, wenn es fehlt;
  - **Cloud-Konto-Zugangsdaten**: Benutzername `<nnn>@ischlstrom.org`,
    zufaelliges rein alphanumerisches Passwort (Sonderzeichen scheitern in
    der iOS-App, siehe `docs/openhab-cloud.md`);
  - einen **einmaligen Provisionierungs-Code** (kurz, 24 Stunden oder bis
    zur ersten Verwendung gueltig).
- Legt den **Mail-Alias** an: `<nnn>@ischlstrom.org -> info@ischlstrom.org`
  ueber die mailcow-API (`POST /api/v1/add/alias`, API-Key in
  `website/.env`, in mailcow auf die IP von s1 beschraenkt). Entscheidung
  vom 2026-08-23: **Alias statt Postfach**. Die Cloud prueft die
  E-Mail-Verifikation nirgends (`verifiedEmail` wird nur gesetzt, nie
  abgefragt); die Adresse dient allein dem Passwort-Reset, dessen Mails so
  beim Vorstand landen. Bestehende Postfaecher koennen bleiben oder in
  Aliase umgewandelt werden. Der Alias wird vor dem Cloud-Konto angelegt;
  schlaegt die mailcow-API fehl, bleibt die Anlage mit Fehlertext am
  Dashboard stehen, statt ein Konto ohne erreichbare Adresse zu erzeugen.
- Setzt `cloud_account_state = pending`; das Konto selbst legt der s1-Timer
  an (siehe unten), weil die Cloud-Registrierung CSRF-geschuetzt ist und die
  Mongo-DB der Cloud nur auf dem Host erreichbar ist.
- Bietet danach den Download `sd-<nnn>.zip` an (Inhalt siehe Stufe 3) und
  zeigt die Karte "Einrichtung" mit Fortschritt (Stufe 2) sowie die Werte,
  die der Vorstand braucht (Tunnel-IP, Linux-Passwort, Cloud-Zugang).

**Neue API `GET /api/ibm/provision/v1?code=...`**

Liefert als JSON alles, was `ibm.conf` heute per Frage befuellt:
`INVERTER_TYPE` (oder `auto`), `IBM_STATUS_TOKEN`, `IBM_ANLAGE_NAME`,
`IBM_API_BASE`, `WG_ADDRESS`, `WG_SERVER_ENDPOINT`, Server-Public-Key,
`DEFAULT_*`, alle `INSTALL_*` auf den Vorstandsvorgaben (Cloud, Watchdog,
Overview, WireGuard, Passwortwechsel alle `1`), dazu Linux-Passwort,
Cloud-UUID und Cloud-Secret. Der Code wird beim ersten Abruf verbraucht
(danach authentifiziert das Status-Token).

**Neue API `POST /api/ibm/provision/v1/result`** (Status-Token im Body)

Der Pi meldet zurueck, was heute am Bildschirm angezeigt und abgetippt wird:
WireGuard-Public-Key, erkanntes Wechselrichter-Profil, Hostname,
Seriennummer des Wechselrichters, gefundene IP. Alles landet in
`members_openhabstatus` und ist am Dashboard sichtbar.

**s1-Timer: WireGuard-Peer und Cloud-Konto automatisch anlegen**

Die Website laeuft im Docker-Container und darf weder `wg` noch die
Cloud-Container aufrufen. Einfachster sicherer Weg: ein Skript auf dem Host
(`/usr/local/sbin/ibm-provision-sync`, root, systemd-Timer jede Minute), das
per `psql service=eeg-middleware` liest und zwei Dinge erledigt:

1. **WireGuard**: Peers mit Public-Key aus der DB, `wg0.conf` daraus neu
   erzeugen (Peer-Bloecke mit Namenskommentar, Registry bleibt die DB),
   `wg syncconf`. Bestehende Tunnel bleiben verbunden. Die heutigen Peers
   (pi-003, pi-007) werden einmalig in die DB uebernommen.
2. **openHAB-Cloud-Konto** fuer Zeilen mit `cloud_account_state = pending`:
   neues CLI in der Cloud-Deployment (`src/cli/makeuser.ts`, nach dem
   Muster von `makeadmin.ts`: `User` + `UserAccount` + `Openhab` mit UUID
   und Secret anlegen, `verifiedEmail = true`, keine Verifikations-Mail),
   aufgerufen per `docker compose exec`. Danach `cloud_account_state =
   created`; Fehler landen als Text in der DB und am Dashboard. Idempotent:
   existiert der Benutzername schon, werden nur UUID/Secret abgeglichen.
   Das Konto existiert damit, **bevor der Pi das erste Mal bootet**;
   sobald der Connector sich meldet, zeigt die Cloud die Anlage Online.

Aufwand: 2 Tage. Betroffene Dateien: Django-Modell `OpenhabStatus`
(neue Felder: `wg_address`, `wg_public_key`, `provision_code`,
`provision_expires`, `cloud_uuid`, `cloud_secret`, `cloud_username`,
`cloud_password`, `cloud_account_state`, `linux_password`, `inverter_type`,
`setup_phase`; Migration), `website/src/lib/server/db/members/openhabStatus`,
`/board/openhab/+page.*`, neue Routen unter `website/src/routes/api/ibm/provision/`,
`website/src/lib/server/mailcow` (Alias-API), `docs/server-setup.md` und
`docs/openhab-cloud.md` (Timer auf s1, CLI in der Cloud), `~/openhab-cloud`
auf s1 (`makeuser.ts`).

Entscheidung noetig: Geheimnisse (Linux-Passwort, Cloud-Secret,
Cloud-Passwort, Wechselrichter-Passwort) liegen damit in der Mittelware-DB.
Vorschlag: symmetrisch verschluesselt mit einem Schluessel aus
`website/.env`, und das Wechselrichter-Passwort wird nach der ersten
Zustellung serverseitig geloescht (siehe Stufe 4).

## Stufe 2: Unbeaufsichtigte Einrichtung am Pi (Setup-Skripte)

Ziel: `install.sh` kommt mit einem Code aus und braucht danach weder
Terminal-Eingabe noch Main UI.

- **Bootstrap mit Code**: `IBM_PROVISION_CODE=<code> install.sh` holt die
  Konfiguration von der Provisionierungs-API und schreibt daraus `ibm.conf`
  (`chmod 600`), ohne den Assistenten zu starten. Der interaktive Assistent
  bleibt fuer Sonderfaelle erhalten.
- **Admin-Konto selbst anlegen**: der einzige Grund, warum heute die Main UI
  vor dem Setup gebraucht wird. `02b-install-things.sh` setzt schon ein
  temporaeres Karaf-Passwort; mit demselben Mechanismus
  `openhab:users add <user> <pw> administrator` ausfuehren, falls noch kein
  Benutzer existiert (`GET /rest/auth/...` bzw. `users.json` pruefen).
  Passwort: vom Server geliefert oder pro Anlage zufaellig und zurueckgemeldet.
- **Wechselrichter-Profil erkennen** (`INVERTER_TYPE=auto`): der Assistent
  ruft `inverter_scan_hosts` aller Profile unter `inverters/` auf. Genau ein
  Profil mit Treffer: uebernehmen und zurueckmelden. Mehrere oder keines:
  Phase `wechselrichter_unklar` melden und alle 5 Minuten erneut suchen,
  bis der Vorstand das Profil am Dashboard setzt (der Pi holt die Antwort
  ueber die Token-API). Die Scans sind schon da (Fronius Solar API, Modbus
  bei Sigenergy/Deye/Victron), neu ist nur die Schleife ueber die Profile.
- **Cloud-Identitaet setzen statt anzeigen**: `07-myopenhab.sh` schreibt
  UUID und Secret aus der Provisionierung nach `/var/lib/openhab/uuid` und
  `/var/lib/openhab/openhabcloud/secret` (Besitzer `openhab`, `chmod 600`),
  **bevor** `02-install-addons.sh` das Cloud-Addon eintraegt (Reihenfolge in
  `install-ibm.sh` anpassen). Weil openHAB die UUID nur beim Start liest,
  startet das Setup openHAB danach einmal neu (`systemctl restart openhab`,
  etwa 1 bis 2 Minuten auf dem Pi 4); die Anlage erscheint dann von selbst
  als Online in dem Konto, das Stufe 1 schon angelegt hat. Die Anzeige
  bleibt als Rueckfall fuer Anlagen ohne Provisionierung.
- **Ergebnisse zurueckmelden statt anzeigen**: `08-install-wireguard.sh`
  schickt den Public-Key an `/api/ibm/provision/v1/result`; die Anzeige am
  Bildschirm bleibt als Rueckfall. `08` wartet danach wie heute auf den
  ersten Handshake, der durch Stufe 1 innerhalb von etwa einer Minute kommt.
- **Einrichtungsphasen melden**: ein Feld `setup_phase` im Status-Push
  (`heruntergeladen`, `addons`, `wechselrichter_gesucht`,
  `wechselrichter_fehlt`, `wartet_auf_passwort`, `tunnel`, `fertig`,
  `fehler:<schritt>`). Das Dashboard zeigt die Phase als Fortschrittsbalken;
  ein Fehler ist damit vom Schreibtisch aus sichtbar, bevor jemand hinfaehrt.
  Der Push muss dafuer frueh verfuegbar sein: ein schlanker `curl` aus
  `lib/common.sh` (`report_phase`), nicht erst die openHAB-Regel.
- **Warten statt abbrechen**: Kein Wechselrichter im Netz gefunden oder
  Internet noch nicht da: Phase melden, alle 5 Minuten neu versuchen, nicht
  mit `die` enden. Bei einer Laien-Installation steckt das LAN-Kabel oft erst
  nach dem Strom.
- **Hauptschalter**: Vorgabe nach Provisionierung `ON` statt `OFF`, weil der
  Vorstand die Anlage ja bewusst angelegt hat (`DEFAULT_MAIN_SWITCH` in
  `ibm.conf`, per Dashboard-Haken steuerbar). Alternativ ein Knopf im
  Mitgliederbereich (siehe Stufe 4).

Aufwand: 2 Tage. Betroffen: `install.sh`, `install-ibm.sh`, `00-wizard.sh`
(Nicht-interaktiver Pfad), `02b`, `07`, `08`, `10`, `lib/common.sh`,
`eeg-api/status_push.js`, `setup/README.md`.

Schon nach Stufe 2 schrumpft der Terminal-Teil auf eine Zeile mit Code,
und der Vorstand kann die Einrichtung bei Bedarf telefonisch begleiten.

## Stufe 3: Vorbereitete SD-Karte (der Terminal-Schritt faellt weg)

Ziel: der Pi startet die Einrichtung beim ersten Boot selbst.

openHABian liest beim ersten Start `openhabian.conf` von der
Boot-Partition (FAT, also von jedem Rechner beschreibbar): Hostname,
Benutzer/Passwort, Zeitzone, WLAN, `adminkeyurl` fuer einen SSH-Schluessel.
Zwei Varianten fuer den Start unseres Setups, beide vorher an einem
Test-Pi verifizieren:

- **Variante A (bevorzugt, wenn moeglich): Standard-Image plus Datei.** Die
  SD-Karte wird mit dem unveraenderten openHABian-Image geflasht; auf die
  Boot-Partition kommen `openhabian.conf` und `ibm-provision.conf` (enthaelt
  nur `IBM_PROVISION_CODE` und `IBM_BASE_URL`). Voraussetzung ist ein Hook,
  der nach der openHABian-Erstinstallation unser Skript startet. Zu pruefen:
  ob openHABian einen solchen Hook anbietet (Stand openHABian 1.9/2.x:
  `first-boot.bash` liegt selbst auf der Boot-Partition; ein eigener Aufruf
  am Ende ist moeglich, aber nicht update-fest).
- **Variante B (robust): eigenes Image.** `setup/build-image.sh` auf dem
  Entwicklungsrechner: openHABian-Image laden, beide Partitionen per
  `losetup` einhaengen, auf der Root-Partition eine systemd-Unit
  `ibm-firstboot.service` ablegen (wartet, bis `openhab.service` laeuft und
  `GET /rest/` antwortet, ruft dann `install.sh` mit dem Code aus
  `/boot/firmware/ibm-provision.conf` auf, wiederholt sich bei Fehler bei
  jedem Boot, bis eine Marke `/var/lib/openhab/ibm/provisioned` existiert).
  Das fertige `ischlstrom-openhabian.img.xz` wird wie das Paket unter
  `website/static/ibm/` veroeffentlicht. Nachteil: muss bei jedem
  openHABian-Release neu gebaut werden; Vorteil: kein Abhaengigkeit von
  openHABian-Interna.

In beiden Varianten schreibt der Vorstand die SD-Karte, und zwar in einem
Schritt: "SD-Karte vorbereiten" am Dashboard (Stufe 1) liefert
`sd-<nnn>.zip` mit `openhabian.conf` (Hostname `pi-<nnn>`, Zeitzone, ggf.
WLAN) und `ibm-provision.conf` (nur `IBM_PROVISION_CODE` und
`IBM_BASE_URL`; kein Token, kein Passwort). Auf dem Entwicklungsrechner
schreibt `setup/prepare-sd.sh sd-007.zip /dev/sdX` das Image (gecacht
unter `~/.cache/ischlstrom/`, Variante A das offizielle, Variante B das
eigene), haengt die Boot-Partition ein, kopiert die beiden Dateien und
wirft die Karte aus. Mehr ist fuer den Vorstand nicht zu tun; wer keinen
Linux-Rechner hat, flasht mit dem Raspberry Pi Imager und kopiert die
beiden Dateien von Hand auf die Boot-Partition. WLAN-Zugangsdaten kommen,
falls noetig, vom Mitglied vorab; LAN bleibt die Empfehlung.

Aufwand: 1 bis 3 Tage, je nach Variante, plus Testzyklen (pro Zyklus rund
45 Minuten Erstboot; `purge-ibm.sh` spart das Neuflashen beim Testen der
Stufen 1 und 2, nicht aber des Hooks).

## Stufe 4: Mitgliederbereich statt Pi-Oberflaeche

Ziel: alles, was das Mitglied sieht oder eingibt, liegt auf ischlstrom.org.

- **Seite "Speichermanagement" unter `/user/[memberId]`**: Einrichtungsphase
  live (aus `setup_phase`), Ladestand und IBM-Status nach Abschluss (die
  Daten sind ueber den Status-Push schon da), Link zur Fernbedienung
  `remote.hac.ischlstrom.org`.
- **Wechselrichter-Passwort** (GEN24): Eingabefeld auf dieser Seite. Das Pi
  fragt in der Phase `wartet_auf_passwort` alle 2 Minuten ueber die
  Token-API nach, holt es einmal ab, traegt es ins Bridge-Thing ein, und der
  Server loescht es danach. Das ist die einzige Eingabe, die ein Mitglied
  selbst machen muss, und sie kann auch der Vorstand eintragen.
- **openHAB-Cloud-Zugang**: Das Konto existiert seit Stufe 1. Der
  Mitgliederbereich zeigt Benutzername (`<nnn>@ischlstrom.org`) und
  Passwort mit der Kurzanleitung fuer die openHAB-App (Remote-URL
  `https://hac.ischlstrom.org`) und dem Link auf
  `remote.hac.ischlstrom.org`; dazu ein Knopf "Neues Passwort", der ueber
  den s1-Timer (`makeuser.ts --reset`) ein frisches setzt. Eine
  Registrierung durch das Mitglied gibt es nicht mehr.
- **Kommandos zum Pi** (optional, spaeter): Die Antwort des Status-Push kann
  ein Feld `commands` tragen (`hauptschalter_ein`, `paket_update`,
  `setup_erneut`). Damit erledigt der Vorstand Paket-Updates und den
  Hauptschalter vom Dashboard aus, ohne SSH. Der Pi fuehrt nur bekannte,
  signierte Kommandos aus und meldet das Ergebnis als Phase.

Aufwand: 1 bis 2 Tage (ohne Kommandos).

## Stufe 5: Kit und Anleitung

- **Stueckliste** je Anlage: Pi 4 oder 5 mit 2 GB und passendem Netzteil
  (Unterspannung ist laut Status-Push-Daten ein reales Problem),
  Gehaeuse, SD-Karte mit Aufkleber "pi-<Nr>", 2 m LAN-Kabel.
- **Ein Blatt Anleitung** (PDF aus dem Repo, `docs/ibm-anleitung-mitglied`):
  drei Bilder, drei Saetze, QR-Code auf die Seite im Mitgliederbereich,
  Hinweis "gleiches Netz wie der Wechselrichter" und "Dauer etwa 45 Minuten,
  die LEDs blinken, das ist normal". Ohne Fachbegriffe, "Speichermanagement"
  statt IBM.
- **Vorstands-Checkliste** im Dashboard-Text: Anlage anlegen, SD-Karte
  schreiben, Kit uebergeben, Fortschritt beobachten, Wechselrichter-Passwort
  eintragen (falls das Mitglied es nicht selbst macht), Hauptschalter.

## Was bewusst nicht gemacht wird

- Kein Bild-zu-Bild-Assistent auf dem Pi selbst (eigene Weboberflaeche am
  Pi): das Mitglied muesste dafuer wieder die IP des Pi finden; der
  Mitgliederbereich existiert schon und ist von ueberall erreichbar.
- Keine automatische openHAB- oder Firmware-Updates: bleibt manuell ueber
  den Tunnel, wie heute dokumentiert.
- Keine Rueckkehr zu SSH-Schluesseln: Passwort-Anmeldung durch den Tunnel
  bleibt, nur wird das Passwort pro Anlage zufaellig und am Dashboard
  abrufbar.

## Sicherheit

- Der Provisionierungs-Code ist einmalig und kurzlebig; auf der SD-Karte
  liegt kein Status-Token und kein Passwort, beides holt der Pi per HTTPS.
- WireGuard-Schluessel entstehen auf dem Pi, nur der Public-Key geht zum
  Server.
- Geheimnisse in der DB verschluesselt (Stufe 1), das Wechselrichter-Passwort
  nur bis zur Zustellung; keine Geheimnisse in App-Logs (DSGVO-Regel).
- Der mailcow-API-Key liegt in `website/.env` und ist in mailcow auf die
  IP von s1 und auf Lese-/Schreibzugriff fuer Aliase beschraenkt; der
  Alias zeigt auf `info@`, nicht auf private Adressen.
- Cloud-Konten entstehen nur ueber den s1-Timer aus Zeilen der
  Mittelware-DB; `REGISTRATION_ENABLED` in der Cloud kann danach auf
  `false`, womit Fremdregistrierungen wegfallen.
- Das Mitglied sieht im Mitgliederbereich nur die eigene Anlage; der
  Vorstand alle.

## Reihenfolge und Aufwand

| Stufe | Ergebnis fuer das Mitglied | Ergebnis fuer den Vorstand | Aufwand |
| --- | --- | --- | --- |
| 1 Provisionierung | Cloud-Konto und Mail-Alias fertig, ohne Registrierung | Mitglied waehlen, fertig: Token, IP, Peer, Cloud-Konto, Alias automatisch | 2 Tage |
| 2 Unbeaufsichtigt | Eine Terminal-Zeile statt 15 Fragen, kein Main-UI-Schritt | Fortschritt und Fehler am Dashboard | 2 Tage |
| 3 SD-Karte | Kein Terminal mehr | `prepare-sd.sh` mit dem Zip vom Dashboard | 1 bis 3 Tage |
| 4 Mitgliederbereich | Fortschritt und Passwort-Eingabe auf ischlstrom.org | Hauptschalter, Updates vom Dashboard (optional) | 1 bis 2 Tage |
| 5 Kit | Drei Schritte, ein Blatt | Checkliste | 0,5 Tage |

Test: je Stufe einmal auf einem Test-Pi mit `purge-ibm.sh` durchspielen,
Stufe 3 zusaetzlich mit frischem Image. Stufen 1 und 2 sind
abwaertskompatibel (bestehende Anlagen bekommen beim Paket-Update nur die
`setup_phase` dazu; ihre WireGuard-Peers muessen einmalig in die DB).

## Getroffene Entscheidungen

- 2026-08-23: **Mail-Alias statt Postfach** fuer die Cloud-Konten
  (`<nnn>@ischlstrom.org -> info@ischlstrom.org`, per mailcow-API).
- 2026-08-23: Cloud-Konten werden **automatisch beim Vorbereiten der
  SD-Karte** angelegt (UUID/Secret serverseitig erzeugt, Konto per CLI ueber
  den s1-Timer); das Mitglied registriert sich nicht mehr selbst.
- 2026-08-23: Beim Vorbereiten der SD-Karte wird **nur das Mitglied
  gewaehlt**; Wechselrichter-Profil wird am Pi erkannt, alles andere
  abgeleitet. Die SD-Karte schreibt der Vorstand.

## Offene Entscheidungen

1. Entschieden: Geheimnisse liegen verschluesselt in der DB (AES-256-GCM,
   `website/src/lib/server/secrets.js`).
2. Entschieden: Hauptschalter nach provisionierter Einrichtung `ON`.
3. Entschieden: weder A noch B, sondern cloud-init (`user-data` auf der
   FAT-Partition) plus serverseitiger Image-Bau (`ibmImage.js`).
4. Soll das Ganze schon mit Blick auf Stromkreis (mehrere Gemeinschaften)
   gebaut werden: dann gehoert die Basis-URL der Provisionierung in die
   SD-Karten-Datei (ist im Plan so vorgesehen) und die Tunnel-IP-Pools werden
   je Gemeinschaft gefuehrt.
