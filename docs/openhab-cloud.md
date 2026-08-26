# openHAB Cloud auf s1 (hac.ischlstrom.org)

Eigene Installation der [openHAB Cloud](https://github.com/openhab/openhab-cloud)
(seit 16. August 2026, ersetzt myopenhab.org). Die Mitglieder erreichen damit
ihre IBM-Anlage von unterwegs ueber die openHAB-App bzw. den Browser; betrieben
wird alles selbst auf s1, es fliessen keine Daten mehr ueber myopenhab.org.

## Architektur

Docker-Compose-Stack in `/home/martin/openhab-cloud/deployment/docker-compose/`
auf s1 (Checkout von github.com/openhab/openhab-cloud; Compose-Projekt
`openhab-cloud-ischlstrom`):

| Container | Image | Zweck |
| --- | --- | --- |
| `app` | `openhab/openhab-cloud:latest` (Docker Hub; auf s1 steht `latest` seit der Installation fuer 2.0.6) | Node-App, lauscht auf 127.0.0.1:3000 |
| `mongodb` | `mongo:6` | Konten, UUIDs/Secrets, Geraete (Volume `mongo-data`) |
| `redis` | `redis:7-alpine` | Sessions/Cache (Volume `redis-data`) |

TLS terminiert Caddy am Host (siehe [server-setup.md](server-setup.md)), beide
Hostnamen zeigen per A-Record auf s1 (94.130.9.254):

| Hostname | Zweck |
| --- | --- |
| `hac.ischlstrom.org` | Website (Registrierung, Kontoverwaltung) + REST fuer App und Cloud Connector (socket.io) |
| `remote.hac.ischlstrom.org` | Proxy-Host: Main UI der Anlage im Browser, Basic Auth mit dem Cloud-Konto |

Der Compose-Stack ist gegenueber dem Upstream-Repo angepasst (Working Tree,
nicht committet): traefik entfernt, `app` an 127.0.0.1:3000 gebunden (Caddy
uebernimmt TLS), TZ Europe/Vienna.

## Konfiguration

Alles in `.env` neben der `docker-compose.yml`; der Container-Entrypoint
rendert daraus `config.json` (Template `config.json.template`, unterstuetzt
`${VAR:-default}`). Nach Aenderungen: `docker compose up -d app` (Recreate,
nicht nur Restart, sonst kommen neue Env-Werte nicht an).

Die wichtigsten Werte und zwei Fallen, die die Erstinstallation gekostet haben:

- `DOMAIN_NAME=hac.ischlstrom.org` und **`PROXY_HOST=remote.hac.ischlstrom.org`**.
  Ohne gesetzten `PROXY_HOST` faellt die App auf `DOMAIN_NAME` zurueck und
  behandelt dann **jede** Anfrage an die Hauptdomain als Remote-Proxy-Zugriff -
  die ganze Website antwortet nur noch 401. Der Proxy-Host muss also immer
  eine eigene Subdomain sein.
- **`NODE_ENV=production`** steht direkt in der `docker-compose.yml`. Ohne den
  Wert laeuft der E-Mail-Dienst im "development mode" und tut nur so, als ob
  er sendet (Log: "emails will be emulated").
- Mail geht ueber **mailcow auf s1** (`SMTP_HOST=s1.ischlstrom.org`, Port 465,
  `SMTP_SECURE=true`, Benutzer `info@ischlstrom.org` mit einem
  mailcow-App-Passwort). Die alten SES-Zugangsdaten stehen als Kommentar in
  der `.env` (Rollback), AWS SES wird nicht mehr verwendet.
- **`FCM_SENDER_ID` und `FCM_SERVICE_FILE` muessen gesetzt sein** (Dummy-Werte
  `0` und `/nonexistent`, `gcm`-Block im `config.json.template`), obwohl Push
  bei uns nicht geht: die Android-App fragt `GET /api/v1/settings/notifications`
  und erkennt den Server nur dann als openHAB Cloud, wenn die Antwort
  `gcm.senderId` enthaelt. Ohne diese Erkennung behandelt sie ihn als normalen
  openHAB-Server und laedt die Main UI unter `https://hac.ischlstrom.org/`,
  also die Startseite der Cloud statt der Anlage (Symptom bei Mitglied 007,
  behoben 22. August 2026). Mit der Erkennung holt sie `/api/v1/proxyurl` und
  laedt die Main UI ueber `remote.hac.ischlstrom.org`. Die fehlende
  Service-Datei loggt beim Start nur `FCM service account file not found`,
  der FCM-Provider bleibt inaktiv.
- `REGISTRATION_ENABLED` bleibt bewusst auf dem Standard `true`: die
  Mitglieder registrieren ihre Konten selbst (laufendes Onboarding). Ein
  Konto allein gewaehrt keinen Zugriff auf fremde Anlagen (dazu braeuchte es
  deren UUID/Secret); Kontrolle der Konten siehe unten.
- `LOG_LEVEL=debug` ist aktuell aktiv (Einrichtungsphase); im Regelbetrieb
  auf `info` stellen.

Env-Variablen erreichen den Container nur, wenn sie in der
`docker-compose.yml` unter `environment:` durchgereicht **und** im Template
verwendet werden - beim Ergaenzen neuer Werte beides nachziehen.

## Anlagen und Clients

Die Anlagenseite dokumentiert
[Batteriemanagement/openhab/setup/README.md](../Batteriemanagement/openhab/setup/README.md)
(Abschnitt "openHAB Cloud"): das IBM-Setup setzt die `baseURL` des Cloud
Connectors auf `https://hac.ischlstrom.org/`. `07-myopenhab.sh` schreibt
bei provisionierten Anlagen die vom Server gelieferten Werte in
`userdata/uuid` und `openhabcloud/secret` (mit openHAB-Neustart); ohne
Provisionierung zeigt es UUID/Secret nur an, fuer die manuelle
Registrierung.

**Seit 23. August 2026 (Zero-Touch-Provisionierung)** entstehen die Konten
automatisch: "SD-Karte vorbereiten" auf `/board/openhab` erzeugt UUID,
Secret, Benutzername `<nnn>@ischlstrom.org` (mailcow-**Alias** auf
`info@ischlstrom.org`, kein Postfach - die Cloud prueft `verifiedEmail`
nirgends, die Adresse dient nur dem Passwort-Reset) und ein
handytaugliches Passwort (12 Zeichen: 9 Kleinbuchstaben + 3 Ziffern, ohne
verwechselbare Zeichen, damit es sich in der openHAB-App ohne Shift- und
Sonderzeichen-Wechsel eingeben laesst); der Timer `ibm-provision-sync` auf s1 legt das
Konto per `scripts/ibm-provision/cloud-makeuser.js` im Container an (siehe
[server-setup.md](server-setup.md)). Der Pi schreibt UUID/Secret in
`userdata`; das Mitglied sieht die Zugangsdaten unter
`/user/<nr>/speichermanagement` und kann dort ein neues Passwort anfordern.
Zustaende in `members_openhabstatus.cloud_account_state`: `pending`/`reset`
(Timer legt an bzw. setzt das Passwort), `created`, `error` (Text in
`cloud_account_error`, am Dashboard sichtbar, "Cloud-Konto erneut"
wiederholt), `delete` (Anlage am Dashboard geloescht: der Timer entfernt
Benutzer, Konto und openHAB-Instanz mit `cloud-makeuser.js` und
`IBM_MODE=delete`, danach verschwindet die DB-Zeile).
Damit kann `REGISTRATION_ENABLED` auf `false`, sobald alle Bestandskonten
umgestellt sind. Der klassische Weg (unten) bleibt fuer Anlagen ohne
Provisionierung.

Kurzfassung je Mitglied (klassisch):

1. Konto auf <https://hac.ischlstrom.org> registrieren (E-Mail + Passwort,
   dabei UUID/Secret der Anlage eintragen), warten bis die Anlage *Online*
   zeigt.
2. openHAB-App: als Remote-URL `https://hac.ischlstrom.org` mit denselben
   Zugangsdaten.
3. Browser: `https://remote.hac.ischlstrom.org` (Basic Auth, Cloud-Konto).

Zwei bekannte Stolpersteine:

- **Sonderzeichen im Konto-Passwort**: die iOS-App scheitert z. B. an `"` im
  Passwort (Browser funktioniert, App bekommt 401 "incorrect password").
  Abhilfe: langes rein alphanumerisches Passwort setzen.
- **Push-Benachrichtigungen funktionieren nicht**: die offiziellen
  openHAB-Apps koennen Pushes nur ueber die APNS/FCM-Zertifikate der openHAB
  Foundation (myopenhab.org) empfangen. Fernzugriff und UI gehen normal; nur
  Benachrichtigungen bleiben stumm. Die Dummy-FCM-Werte (siehe oben) aendern
  daran nichts, sie dienen nur der Cloud-Erkennung durch die App.

## Betrieb

```bash
# Status, Logs (auf s1)
docker ps --filter name=openhab-cloud
docker logs --since 1h openhab-cloud-ischlstrom-app-1

# Konfig-Aenderung uebernehmen / Neustart
cd /home/martin/openhab-cloud/deployment/docker-compose && docker compose up -d app

# Update auf neues Image
docker compose pull app && docker compose up -d app

# Cloud-Erkennung durch die Apps pruefen (mit einem eigenen Cloud-Konto):
# muss {"gcm":{"senderId":"0"}} bzw. die remote.-URL liefern
curl -u KONTO:PASSWORT https://hac.ischlstrom.org/api/v1/settings/notifications
curl -u KONTO:PASSWORT https://hac.ischlstrom.org/api/v1/proxyurl

# Registrierte Konten pruefen (Fremdregistrierungen erkennen)
docker exec openhab-cloud-ischlstrom-mongodb-1 mongosh openhab --quiet \
  --eval 'db.users.find({}, {username:1, active:1, created:1}).toArray()'
```

Fehlersuche: `LOG_LEVEL=debug` protokolliert jeden Loginversuch mit
Benutzername und Grund ("Authentication failed for ..."); Health-Endpoint
`https://hac.ischlstrom.org/health`.

## Noch offen

- **Backup**: das s1-Backup (siehe [server-setup.md](server-setup.md)) sichert
  die MongoDB des Stacks bisher **nicht** - dort liegen alle Konten und die
  UUID/Secret-Zuordnung der Anlagen. `mongodump` in `s1-backup.sh` ergaenzen.
- Migration der Bestandsanlagen von myopenhab.org (laufend; ein Paket-Update
  stellt die `baseURL` um, das Konto muss vorher auf der neuen Cloud
  existieren).
- `LOG_LEVEL=info`, wenn das Onboarding durch ist.
