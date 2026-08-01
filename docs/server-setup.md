# Server-Setup (seit 1. August 2026)

Website und Datenbanken laufen auf **s1.ischlstrom.org** (Hetzner,
94.130.9.254 / 2a01:4f8:10b:e1a::2). Der fruehere Heimserver ("server",
85.127.127.139) ist ausser Betrieb; sein PostgreSQL bleibt vorerst als
kalte Kopie mit dem Stand der Migration liegen.

## Dienste auf s1

TLS terminiert **Caddy** am Host (`/etc/caddy/Caddyfile`):

| Hostname | Ziel | Dienst |
| --- | --- | --- |
| ischlstrom.org, www | localhost:3001 | **Website** (Docker `ischlstrom-website`) |
| s1.ischlstrom.org | localhost:8090 | mailcow (auch MX fuer ischlstrom.org) |
| hac.ischlstrom.org | localhost:3000 | openHAB Cloud |
| nextcloud.ischlstrom.org | localhost:11000 | Nextcloud AIO |
| newsletter.ischlstrom.org | localhost:4000 | keila |

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
- **Heimserver, taeglich 05:30** (crontab martin): `pull-backups-home.sh`
  spiegelt `/var/backups/s1/` nach `~/backups-s1/` (Offsite-Kopie; Pull,
  s1 erreicht den Heimserver nicht). Log: `~/backups-s1/pull.log`.
- Restore: `pg_restore -d <db> <datei>.dump`; Globals sind plain SQL.

Noch offen:

1. Nextcloud AIO: Borg-Backup im Master-UI pruefen/aktivieren und die
   **Borg-Passphrase sicher ablegen**.
2. Gitignorte Secrets (`website/.env*`, `notebooks/.pgpass`,
   `.pg_service.conf`) existieren nur auf Workstation und Servern -
   separat privat sichern.
3. Restore-Test einplanen (Dump in eine Scratch-DB einspielen).
4. Plattenplatz beobachten: `journalctl -u s1-backup` zeigt Belegung und
   freien Platz nach jedem Lauf.
