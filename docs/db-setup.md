# Datenbank-Setup: Produktion und Entwicklung

Die Website nutzt zwei PostgreSQL-Datenbanken (siehe auch CLAUDE.md):

- **`ischlstrom_middleware`** - Fachdaten (Mitglieder, Messwerte, Wetter,
  Buchhaltung, IBM-Status). Das Schema gehoert dem Django-Projekt in
  `middleware/` (Models + Migrationen); die Website liest und schreibt
  direkt per `pg`-Pool daran vorbei.
- **`ischlstrom_authjs_website`** - Session-/User-Store von Auth.js
  (Magic-Link-Login), komplett getrennt vom Fachschema.

Beide existieren zweimal: **Produktion auf s1**, **Entwicklung auf dem
Heimserver**. Die Entwicklungs-Kopie wird jede Nacht automatisch aus den
s1-Backups aufgefrischt.

## Produktion: s1.ischlstrom.org

PostgreSQL 16 direkt am Host (kein Container), Zugriff nur per `hostssl`;
Rollen heissen wie die Datenbanken. Details zu Diensten, pg_hba und
Deployment: [server-setup.md](server-setup.md).

**Achtung fail2ban:** s1 sperrt die Quell-IP schon nach **einem**
fehlgeschlagenen PostgreSQL-Login. Keine Zugangsdaten "einfach probieren";
im Zweifel per SSH auf s1 arbeiten.

## Entwicklung: Heimserver "server"

Der Heimserver (LAN, `server.fritz.box` / 192.168.178.38, PostgreSQL 14)
war bis zur Migration am 1. August 2026 die Produktion und ist seither die
**Dev-Datenbank**: `website/.env` auf der Workstation zeigt mit
`MIDDLEWARE_DB_HOST`/`AUTHJS_DB_HOST` auf `server`, `npm run dev` arbeitet
also immer gegen diese Kopie. Passwoerter liegen in `notebooks/.pgpass`
(Host `server`, gitignored).

Was daraus folgt:

- Die Dev-Daten sind **hoechstens einen Tag alt** (Stand: naechtlicher
  Dump 03:14). Live-Daten, z. B. die IBM-Statusmeldungen unter
  `/board/openhab`, gibt es nur in Produktion - die Anlagen melden an
  ischlstrom.org, nie an den Dev-Server.
- Alles, was man in der Dev-DB anlegt (Test-Tokens, Testdaten), wird am
  naechsten Morgen um 06:00 **ueberschrieben**. Das ist Absicht:
  Experimente bleiben folgenlos und erreichen nie die Produktion.
- Schema-Aenderungen, die per Django-Migration in Produktion gehen, kommen
  am naechsten Morgen automatisch in der Dev-DB an.

## Die naechtliche Kette

| Zeit | Wo | Was |
| --- | --- | --- |
| 03:14 | s1 | `s1-backup.timer`: `pg_dump -Fc` aller DBs nach `/var/backups/s1/postgres/` (plus mailcow und Configs, siehe [server-setup.md](server-setup.md)) |
| 05:30 | Heimserver | `pull-backups-home.sh` (crontab martin): spiegelt die Backups nach `~/backups-s1/` |
| 06:00 | Heimserver | `refresh-dev-db.sh` (crontab martin): spielt die neuesten Dumps der beiden Website-DBs in das lokale PostgreSQL ein |

Log des Refresh: `~/backups-s1/refresh-dev-db.log` auf dem Heimserver;
bei Fehlern endet der Lauf mit Exit 1 (Cron mailt die Ausgabe).

## refresh-dev-db.sh im Detail

Repo-Kopie: `scripts/refresh-dev-db.sh`, installiert nach
`/home/martin/refresh-dev-db.sh` auf dem Heimserver.

- **pg_restore laeuft im Docker-Container `postgres:17`.** Der Heimserver
  hat nur die PostgreSQL-14-Clients, und s1 (PostgreSQL 16) dumpt im
  Archivformat 1.15 - `pg_restore` 14 bricht damit sofort ab
  ("unsupported version in file header") und stellt **nichts** wieder her.
  Tueckisch daran: die alten Daten bleiben dann einfach liegen, eine reine
  Zeilenzahl-Pruefung merkt davon nichts. Der Container haengt im
  Host-Netz und bekommt `server` per `--add-host` aufgeloest.
- **`--clean --if-exists --no-owner --no-privileges`** ersetzt alle
  Objekte in der bestehenden DB; die DB selbst bleibt. Dafuer reichen die
  normalen DB-Benutzer, ein Superuser wird nicht gebraucht, und offene
  Verbindungen eines laufenden Dev-Servers stoeren nicht.
- **Fehlerbewertung statt Exit-Code:** `pg_restore` liefert auch bei
  harmlosen Meldungen Exit 1. Das Skript prueft deshalb die
  `pg_restore: error:`-Zeilen selbst und ignoriert nur zwei bekannte,
  harmlose Faelle: `COMMENT ON EXTENSION` (Nicht-Superuser) und
  `SET transaction_timeout` (setzt pg_restore 17 zu Sitzungsbeginn, die
  14er-Zieldatenbank kennt den Parameter nicht). Jede andere Fehlerzeile
  laesst den Lauf scheitern.
- **Plausibilitaetspruefung:** nach dem Restore muss eine Kerntabelle je
  DB Zeilen haben (`members_member` bzw. `users`), sonst Exit 1.

## Einrichtung und Aenderungen

`scripts/install-dev-db-refresh.sh` (idempotent, vom Entwicklungsrechner
aus) kopiert das Skript auf den Heimserver, ergaenzt dort `~/.pgpass` um
die `server:`-Zeilen aus `notebooks/.pgpass` und traegt den Cron-Job ein.
Nach jeder Aenderung an `refresh-dev-db.sh` einfach erneut ausfuehren:

```bash
cd scripts
./install-dev-db-refresh.sh
ssh martin@server /home/martin/refresh-dev-db.sh   # Testlauf
```

Wer die Dev-DB sofort auf den Stand der letzten Nacht bringen will (statt
auf 06:00 zu warten), fuehrt einfach den Testlauf oben aus.

## Einmalige Werkzeuge (Migration August 2026)

`scripts/` enthaelt daneben die Skripte der Migration Heimserver -> s1:
`setup-s1-postgres.sh` (Rollen/DBs auf s1 anlegen),
`export-server-db-*.sh` (Dump vom Heimserver) und `restore-s1-db-*.sh`
(Einspielen auf s1). Fuer den Alltag werden sie nicht mehr gebraucht;
Dumps grundsaetzlich mit `--no-owner --no-privileges` ziehen.
