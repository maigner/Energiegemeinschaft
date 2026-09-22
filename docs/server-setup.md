# Server-Setup (seit 1. August 2026)

Website und Datenbanken laufen auf **s1.ischlstrom.org** (Hetzner,
94.130.9.254 / 2a01:4f8:10b:e1a::2). Der fruehere Heimserver ("server",
85.127.127.139) dient seither als **Dev-Datenbank** der Website; sein
PostgreSQL wird jede Nacht aus den s1-Backups aufgefrischt
(siehe [db-setup.md](db-setup.md)).

## Dienste auf s1

TLS terminiert **Caddy** am Host (`/etc/caddy/Caddyfile`):

| Hostname | Ziel | Dienst |
| --- | --- | --- |
| ischlstrom.org, www | localhost:3001 | **Website** (Docker `ischlstrom-website`) |
| s1.ischlstrom.org | localhost:8090 | mailcow (auch MX fuer ischlstrom.org) |
| hac.ischlstrom.org | localhost:3000 | openHAB Cloud (siehe [openhab-cloud.md](openhab-cloud.md)) |
| remote.hac.ischlstrom.org | localhost:3000 | openHAB Cloud Remote-Proxy (Main UI der Anlagen) |
| nextcloud.ischlstrom.org | localhost:11000 | Nextcloud AIO |
| newsletter.ischlstrom.org | localhost:4000 | keila |
| (kein Hostname) | 127.0.0.1:8180, 172.17.0.1:8180 | signal-cli-rest-api (Signal-Alarme, siehe unten) |

Achtung: `s1.ischlstrom.org` gehoert mailcow, Port 3000 gehoert openHAB
Cloud - die Website nutzt deshalb Host-Port **3001**.

s1 ist ausserdem die **WireGuard-Zentrale** (10.88.0.1) fuer die
IBM-Anlagen (10.88.0.11 ff.) und der SSH-Sprungpunkt zu ihnen
(siehe Batteriemanagement/openhab/setup/README.md, "Fernwartung").

## Website deployen

```bash
cd website
./deploy-server.sh           # rsync + Docker-Build + Start auf s1 (Standard)
```

Je Ziel gilt eine eigene Umgebungsdatei: `.env.s1` (gitignored) landet auf
s1 als `.env`; darin zeigen die DB-Hosts auf `172.17.0.1` (Docker-Bridge,
also das PostgreSQL des Hosts). `./deploy-server.sh server` deployt auf
den Heimserver - nur fuer den Notfall, falls s1 ausfaellt.

## Datenbanken

PostgreSQL 16 direkt auf s1 (kein Container). Beide Website-DBs
(`ischlstrom_middleware`, `ischlstrom_authjs_website`) gehoeren dem
jeweils gleichnamigen Benutzer. Zugriff nur per `hostssl` (pg_hba):

- `172.16.0.0/12` - Docker-Container auf s1 (Website)
- `85.127.127.139/32` - Heimnetz/Workstation (Django, Notebooks, psql);
  aendert sich diese IP, muss die pg_hba auf s1 nachgezogen werden

Workstation-Clients verbinden ueber den Service `eeg-middleware`
(`notebooks/.pg_service.conf`, `middleware/eeg/.pg_service.conf`,
Passwoerter in `notebooks/.pgpass` - alles gitignored,
`host=s1.ischlstrom.org`).

Dump/Restore-Werkzeuge liegen in `scripts/` (setup-s1-postgres.sh,
export-server-db-*.sh, restore-s1-db-*.sh). Dumps immer mit
`--no-owner --no-privileges` ziehen, sonst scheitert das Einspielen als
normaler Benutzer an ALTER-OWNER-Befehlen.

## Backups (eingerichtet am 1. August 2026)

Skripte in `scripts/backup-s1/`:

- **s1, taeglich 03:14** (`s1-backup.timer` -> `/usr/local/bin/s1-backup.sh`):
  `pg_dump -Fc` aller Datenbanken + Globals (das Host-PostgreSQL traegt
  neben der Website auch die OpenHAB-DBs der Mitglieder, keila und KEM),
  mailcow-Backup (7 Tage Rotation - Vollkopien der Maildaten), Config-Tar
  (`/etc/caddy`, `/etc/wireguard` = Anlagen-Registry, `/etc/postgresql`).
  Ziel `/var/backups/s1/`, 14 Tage Rotation. Log: `journalctl -u s1-backup`.
  Achtung: `/var/backups/s1/mailcow` muss `0755` bleiben - das mailcow-Skript
  prueft die Others-Rechte des Zielverzeichnisses und bricht sonst ab
  ("is not write-able for others"). Genau das passierte vom 2. August bis
  22. September 2026 (die Rechte-Bereinigung am Skriptende hatte o-rwx
  gesetzt): sieben Wochen kein mailcow-Backup, keine Config-Tarballs und
  keine Rotation, 53 Tage Dumps (33 GB) auf `/` (92% voll). Seit dem Fix
  laeuft die Rotation auch, wenn mailcow fehlschlaegt, und nach jedem Lauf
  geht eine Ergebnis-Mail (`[s1-backup] OK` bzw. `FEHLER`, mit Protokoll
  und Plattenbelegung) an `BACKUP_MAIL_TO` aus `/etc/default/s1-backup`
  (`s1-backup-notify.sh` als `ExecStopPost`, Versand ueber das
  Host-Postfix, das per SASL an mailcow weiterreicht). Bleibt die Mail
  aus, ist der Timer oder das Host-Postfix das Problem.
- **Heimserver, taeglich 05:30** (crontab martin): `pull-backups-home.sh`
  spiegelt `/var/backups/s1/` nach `~/backups-s1/` (Offsite-Kopie; Pull,
  s1 erreicht den Heimserver nicht). Log: `~/backups-s1/pull.log`.
- **Heimserver, taeglich 06:00** (crontab martin): `refresh-dev-db.sh`
  spielt die neuesten Dumps der beiden Website-DBs in das lokale
  PostgreSQL ein - der Heimserver ist damit die taeglich aufgefrischte
  Dev-DB **und** ein staendiger Restore-Test der Backups
  (siehe [db-setup.md](db-setup.md)).
- Restore: `pg_restore -d <db> <datei>.dump`; Globals sind plain SQL.
  Achtung: die Dumps von s1 (PostgreSQL 16, Archivformat 1.15) brauchen
  einen pg_restore ab Version 16.

## IBM-Provisionierung (ibm-provision-sync, seit 23. August 2026)

Der Zero-Touch-Einrichtung der Raspberry Pis
([ibm-setup-vereinfachung.md](ibm-setup-vereinfachung.md)) erledigt auf s1
ein root-Timer, was die Website im Container nicht darf. Skripte in
`scripts/ibm-provision/`, Einrichtung einmalig mit
`scripts/ibm-provision/install-on-s1.sh` vom Entwicklungsrechner aus (kopiert
nach s1 und startet dort `setup-on-s1.sh` als root; das Repo liegt nicht
auf s1):

- **`ibm-provision-sync.timer`** (jede Minute) ->
  `/usr/local/sbin/ibm-provision-sync.sh`, Konfiguration
  `/etc/ibm-provision.conf`. Log: `journalctl -u ibm-provision-sync`.
- **WireGuard**: `/etc/wireguard/wg0.conf` wird aus
  `wg0.base.conf` ([Interface]-Block) plus allen Peers aus
  `members_openhabstatus` (`wg_address`, `wg_public_key`) erzeugt und per
  `wg syncconf` nachgeladen; die DB ist die Registry, `wg_synced_at` der
  Stempel. `setup-on-s1.sh` uebernimmt die bestehenden Peers einmalig
  anhand des Kommentars `# <name> - <ip>` (Name = `members_openhabstatus.name`).
  Peers von Hand nur noch in `wg0.base.conf` eintragen. Sicherung: der
  Timer entfernt aus der `wg0.conf` nur Peers von Anlagen, die am
  Dashboard geloescht wurden (`setup_phase = 'geloescht'`); jede andere
  Verkleinerung wird verweigert, ausser
  `sudo touch /etc/wireguard/ibm-allow-fewer-peers` liegt vor (ein Lauf).
- **Anlage loeschen** (Dashboard "Anlage loeschen"): die Website markiert
  nur (`setup_phase = 'geloescht'`, Cloud-Konto `delete`, Code und
  Passwoerter sofort weg); der Timer nimmt den Peer aus der `wg0.conf`,
  loescht das Cloud-Konto (`cloud-makeuser.js` mit `IBM_MODE=delete`) und
  entfernt danach die Zeile samt Verlauf. Bis dahin zeigt das Dashboard
  "Wird geloescht" mit "Loeschen zuruecknehmen".
- **openHAB-Cloud-Konten**: fuer Zeilen mit `cloud_account_state`
  `pending` oder `reset` laeuft `cloud-makeuser.js` per
  `docker compose exec -T app node -` im Cloud-Container (nutzt dessen
  `dist/models` und `config.json`; das offizielle Image hat kein eigenes
  CLI). Es legt Benutzer, Konto und openHAB-Instanz (UUID/Secret) an bzw.
  setzt das Passwort, `verifiedEmail = true`, keine Mail. Die Geheimnisse
  kommen verschluesselt aus der DB (AES-256-GCM); den Schluessel
  `IBM_SECRET_KEY` liest das Skript aus der `.env` der Website
  (`WEBSITE_ENV`). Ergebnis: `created` bzw. `error` + Text am Dashboard.
- **Website-`.env`** braucht dafuer `IBM_SECRET_KEY` (`openssl rand -hex 32`,
  nie wechseln, sonst sind die gespeicherten Geheimnisse verloren),
  `MAILCOW_URL`, `MAILCOW_API_KEY` und `MAILCOW_ALIAS_GOTO`. Optional:
  `IBM_IMAGE_DIR` (Ablage der SD-Images, Vorgabe
  `/var/lib/ischlstrom/images`), `IBM_WG_SUBNET_PREFIX` (Vorgabe
  `10.88.0`), `IBM_CLOUD_MAIL_DOMAIN` (Vorgabe `ischlstrom.org`).
  mailcow-Key: System -> Konfiguration -> Zugang -> API, **API aktivieren**
  (Lese-/Schreibzugriff) und bei "Zugriff erlauben von" neben den Adressen
  von s1 (94.130.9.254, 2a01:4f8:10b:e1a::2) auch das Docker-Netz
  `172.17.0.0/16` eintragen: die Website ruft die API aus dem Container
  auf, mailcow sieht dann die Container-Adresse. Pruefen (liefert 401,
  solange Key oder Adresse nicht passen):
  `curl -H "X-API-Key: <key>" https://s1.ischlstrom.org/api/v1/get/alias/all`.
  Nicht mehrfach mit falschem Key probieren, mailcow sperrt nach einigen
  Fehlversuchen die Adresse. Schlaegt der Alias fehl, steht das am
  Dashboard ("Mail-Alias error: ..."); "Mail-Alias erneut" wiederholt nur
  diesen Schritt.
- **SD-Karten-Image** (Dashboard "Image erstellen"): baut die Website
  selbst im Container (`website/src/lib/server/ibmImage.js`): aktuelles
  openHABian-Image von GitHub (Cache `base/`), `xz -dc`, die drei
  Konfigurationsdateien per `mcopy` (mtools) in die FAT-Boot-Partition,
  `gzip` -> `<name>.img.gz`, Download ueber
  `/board/openhab/<id>/image.img.gz`. Dafuer: `xz-utils` + `mtools` im
  Docker-Image (`website/Dockerfile`) und das Volume `ischlstrom-images`
  auf `/var/lib/ischlstrom/images` (`website/run-docker.sh`), das den
  Container-Neubau ueberlebt. Platz: rund 7 GB waehrend des Baus
  (entpacktes Arbeits-Image), danach rund 1,5 GB je fertigem Image plus
  1,5 GB Basis-Image. Das Image einer Anlage wird geloescht, sobald der
  Pi die Phase `fertig` meldet oder die Anlage geloescht wird; es baut
  immer nur ein Image gleichzeitig, ein Container-Neustart bricht den Bau
  ab (Dashboard zeigt dann den Fehler, einfach neu starten).
  Aufraeumen von Hand:
  `docker exec ischlstrom-website ls -la /var/lib/ischlstrom/images`.
- Django-Migration `members 0030` ist auf Prod eingespielt (23. August
  2026). Seitdem zeigt `manage.py` direkt auf Prod: `settings.py` setzt
  keinen `HOST` mehr (der hatte mit `"server"` den Service-Host
  ueberschrieben, sodass `migrate` nur die Dev-DB traf); Host kommt aus
  `middleware/eeg/.pg_service.conf` (s1), das Passwort aus
  `middleware/eeg/.pgpass` (braucht die s1-Zeile, gitignored).

## Signal-Alarme (signal-cli-rest-api, seit 19. September 2026)

Die Offline-Alarme des Speichermanagements
(`website/src/lib/server/mail/notifications/ibmAlerts.js`) gehen neben
der Mail an info@ auch per Signal hinaus, weil das Postfach abends
niemand liest. Die Systemalarme der Pis (`ibmSystemAlerts.js`, Cron
`checkSystemAlerts` alle 5 Minuten: SD-Karte ab 70% belegt,
CPU-Temperatur ab 60 °C, RAM ab 50%, Swap sobald belegt; Entwarnung
5 Punkte unter der Schwelle bzw. bei leerem Swap, je Anlage und
Kennzahl eine Meldung, Stand in `members_openhabstatus.system_alerts`)
gehen nur per Signal hinaus, ohne `SIGNAL_API_URL` gar nicht. Dafuer laeuft auf s1 der Container
`signal-cli-rest-api` (`bbernhard/signal-cli-rest-api`, Modus `native`),
Compose-Datei `~/Container/signal-cli/compose.yaml`, Kontodaten in
`~/Container/signal-cli/data/` (im nightly Backup der Configs
mitnehmen). Kein TLS, keine Authentifizierung: der Port 8180 ist nur
an `127.0.0.1` und an die Docker-Bridge `172.17.0.1` gebunden, die
Website erreicht ihn wie die Datenbanken ueber `172.17.0.1`.

- **Konto:** Martins Signal-Konto, als Zweitgeraet `ischlstrom-s1`
  verknuepft (kein eigenes Handy, keine eigene Nummer). Verknuepfen:
  `curl -o qr.png "http://127.0.0.1:8180/v1/qrcodelink?device_name=ischlstrom-s1"`,
  QR-Code am Handy unter Einstellungen -> Gekoppelte Geraete scannen;
  danach zeigt `curl http://127.0.0.1:8180/v1/accounts` die Nummer.
  Signal entkoppelt Zweitgeraete, die laenger (rund 30 Tage) nicht
  aktiv waren - `AUTO_RECEIVE_SCHEDULE` (stuendlicher Empfang) haelt das
  Geraet aktiv. Ein entkoppeltes Geraet faellt durch Fehler beim Senden
  im Website-Log auf (`checkSilentPlants: Signal ... fehlgeschlagen`,
  `checkSystemAlerts: Signal ... fehlgeschlagen`);
  dann neu verknuepfen.
- **Website-`.env`:** `SIGNAL_API_URL=http://172.17.0.1:8180`,
  `SIGNAL_NUMBER=+43...` (die verknuepfte Nummer),
  `SIGNAL_RECIPIENTS` (leer = "Notiz an mich"; sonst Nummern oder
  Gruppen-IDs, kommagetrennt - Gruppen-IDs liefert
  `curl http://127.0.0.1:8180/v1/groups/<nummer>`). Ohne
  `SIGNAL_API_URL` bleibt es bei der Mail.
- **Test:** `node scripts/signal-send.js "Test"` in `website/` (liest
  `.env`; vom Entwicklungsrechner per `ssh -L 8180:127.0.0.1:8180
  s1.ischlstrom.org` und `SIGNAL_API_URL=http://127.0.0.1:8180`), oder
  direkt auf s1:
  `curl -X POST -H 'Content-Type: application/json' -d '{"number":"+43...","recipients":["+43..."],"message":"Test"}' http://127.0.0.1:8180/v2/send`.
- **Betrieb:** `docker compose -f ~/Container/signal-cli/compose.yaml
  logs`, Update mit `docker compose pull && docker compose up -d` im
  selben Verzeichnis (noetig, wenn Signal das Protokoll aendert und der
  Versand mit Fehlern aus dem Container quittiert wird).

## Newsletter (keila)

Der Newsletter laeuft auf Keila (Container `keila`, `pentacent/keila`,
Port 4000, Caddy-Vhost `newsletter.ischlstrom.org`, DB im Host-Postgres
und damit im nightly Backup). Die Kontaktliste pflegt die Website:
der Cron `syncNewsletterContacts` (taeglich 04:50,
`website/src/lib/server/newsletter/keilaSync.js`) gleicht alle
Mitglieder mit mindestens einem aktiven Zaehlpunkt ueber die Keila-API
ab - anlegen, bei Namens- oder Datenaenderung aktualisieren, nach dem
Austritt loeschen. Je E-Mail-Adresse entsteht ein Kontakt (Betriebe und
Familien mit mehreren Mitgliedsnummern: Namen der kleinsten Nummer, alle
Nummern in den Daten). Kontaktdaten in Keila: `mitglied` (true),
`mitgliedsnummer`, `mitgliedsnummern`, `ort`, `erzeuger` (hat einen
Erzeugungs-Zaehlpunkt). Der Abgleich schickt nie einen Status mit:
wer sich abgemeldet hat, bleibt abgemeldet; Kontakte ohne `mitglied`
(von Hand angelegt, Formular) bleiben unangetastet.

- **Einrichten:** in Keila im Projekt unter Einstellungen einen
  API-Schluessel anlegen und in die Website-`.env` eintragen:
  `KEILA_API_URL=http://172.17.0.1:4000`, `KEILA_API_KEY=...`. Ohne die
  beiden Variablen tut der Cron nichts. Fuer Aussendungen an alle
  Mitglieder in Keila ein Segment mit dem Filter `{"data.mitglied": true}`
  anlegen (Erzeuger: zusaetzlich `"data.erzeuger": true`).
- **Probelauf und Import von Hand:** `node scripts/keila-contacts.js
  --sync --dry-run` in `website/` zeigt, was der Abgleich taete (liest
  `.env`; vom Entwicklungsrechner per `ssh -L 4000:127.0.0.1:4000
  s1.ischlstrom.org` und `KEILA_API_URL=http://127.0.0.1:4000`);
  `--out kontakte.csv` schreibt dieselbe Liste als CSV fuer Kontakte ->
  Importieren (Haken "Duplikate ersetzen"; die Datei hat absichtlich
  keine Spalte `status`, sonst wuerde der Import Abgemeldete wieder
  aktivieren). Die CSV enthaelt personenbezogene Daten (`keila-*.csv`
  ist in `website/.gitignore`), nach dem Import loeschen.
- **Betrieb:** Compose-Datei `/opt/keila/docker-compose.yml`, Update
  mit `docker compose pull && docker compose up -d` dort. Port 4000 ist
  seit 22. September 2026 wie bei signal-cli nur an `127.0.0.1` und an
  die Docker-Bridge `172.17.0.1` gebunden (vorher `0.0.0.0`, Keila war
  damit ohne TLS aus dem Internet erreichbar); Caddy und die Website
  brauchen nicht mehr.

## Energiedaten-Import (eegfaktura-import, seit September 2026)

Die Viertelstundenwerte kommen taeglich direkt aus dem Energystore von
EEG-Faktura statt aus dem manuell geladenen Excel-Report
(`notebooks/energyData/README.md`). Skript
`notebooks/energyData/eegfaktura_import.py`, Einrichtung auf s1 mit
`scripts/eegfaktura-import/install-on-s1.sh` vom Entwicklungsrechner aus
(kopiert Skripte hoch, startet dort `setup-on-s1.sh` als root; wiederholbar,
auch fuer Updates der Python-Skripte):

- **`eegfaktura-import.timer`** (taeglich 05:00, bis 5 min Zufallsversatz)
  -> `/usr/local/sbin/eegfaktura-import.sh` als Benutzer `postgres`
  (peer-Auth am Socket, darf die Materialized Views auffrischen). Python
  im venv `/usr/local/lib/eegfaktura-import/venv`. Log:
  `journalctl -u eegfaktura-import`.
- **Zugangsdaten** in `/etc/eegfaktura-import.env` (root, 0600): normale
  EEG-Faktura-Anmeldung (`FAKTURA_USER`, `FAKTURA_PASSWORD` ohne
  Doppelpunkt, `RC_NUMBER`, `EC_ID` = 33-stellige Gemeinschafts-ID, mit der
  falschen antwortet die API stumm leer). Kein API-Schluessel, kein Keycloak-Zugang
  noetig: der Energystore prueft Basic-Auth selbst gegen Keycloak.
- **Fenster**: letzter Tag in `metering_measurement` minus 14 Tage bis
  gestern, ein Tag je Anfrage mit 5 s Pause, hoechstens 92 Tage je Lauf.
  Upsert je Tag, unveraenderte Werte bleiben unangetastet; danach
  `weekly_metering_summary`, `daily_metering_summary`,
  `daily_metering_quality`.
- **Prognose**: eigener Timer **`eeg-forecast.timer`** (taeglich 05:30,
  nach dem Import) -> `/usr/local/sbin/eeg-forecast.sh` als `postgres`,
  rechnet `eeg_forecast.py --refresh --days 30 --days-ahead 14 --store`
  (Kopie unter `/var/lib/eegfaktura-import/forecast/`, Cache daneben,
  Pakete numpy/pandas/scikit-learn im selben venv). Laeuft bewusst
  unabhaengig vom Import: die Wettervorhersage aendert sich taeglich, und
  ein haengender Import darf die Prognose nicht stoppen. `--days-ahead 14`
  verlaengert den Horizont, wenn die Messdaten hinterherhinken, damit die
  naechsten zwei Wochen immer abgedeckt sind (das Wetter reicht 16 Tage).
  Log: `journalctl -u eeg-forecast`. `/board/openhab` zeigt das Alter des
  neuesten Laufs (rot ab 36 h). Jeder Lauf bringt rund 2.900 Zeilen in
  `metering_energyforecast`; Laeufe werden nie ueberschrieben.
- **Vergleichslauf** ohne Schreiben (Tag, der schon in der DB liegt):
  `sudo bash -c 'set -a; . /etc/eegfaktura-import.env; runuser -u postgres -- /usr/local/sbin/eegfaktura-import.sh --verify 2026-09-01'`.
  Meldet die Ausgabe einen Zeitversatz, `--ts-shift-minutes` im Wrapper
  ergaenzen.
- Bei 403 bricht der Lauf sofort ab (jede Anfrage ist eine
  Keycloak-Anmeldung, nicht wiederholen); Passwortwechsel bei EEG-Faktura
  also auch in der env-Datei nachziehen.

Noch offen:

1. Nextcloud AIO: Borg-Backup im Master-UI pruefen/aktivieren und die
   **Borg-Passphrase sicher ablegen**.
2. Gitignorte Secrets (`website/.env*`, `notebooks/.pgpass`,
   `.pg_service.conf`) existieren nur auf Workstation und Servern -
   separat privat sichern.
3. Restore-Test einplanen (Dump in eine Scratch-DB einspielen). Die
   beiden Website-DBs sind durch den taeglichen Dev-Refresh abgedeckt;
   offen bleiben die uebrigen DBs (openhabian*, keila, KEM), mailcow und
   die Config-Tarballs.
4. Plattenplatz beobachten: `journalctl -u s1-backup` zeigt Belegung und
   freien Platz nach jedem Lauf. Stand 23. August 2026: 15 GB frei; der
   Image-Bau braucht 7 GB, liegen mehrere fertige Images herum, wird es
   eng (siehe SD-Karten-Image oben). Stand 22. September 2026: 13 GB frei,
   groesste Posten Docker-Build-Cache (40 GB, `docker builder prune -a`),
   Images 27 GB, Dumps 33 GB (Rotation war kaputt, s.o.), Journal 2 GB
   (`journalctl --vacuum-size=500M`). Das LVM-Volume `/mnt/backup` (196 GB)
   ist praktisch leer - Kandidat fuer `BACKUP_ROOT`, dann auch
   `pull-backups-home.sh` anpassen.
5. openHAB Cloud: die MongoDB des Stacks (Konten, UUID/Secret der Anlagen)
   wird noch nicht gesichert - `mongodump` in `s1-backup.sh` ergaenzen
   (siehe [openhab-cloud.md](openhab-cloud.md)).
