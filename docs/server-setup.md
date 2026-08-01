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
./deploy-server.sh s1        # rsync + Docker-Build + Start auf s1
```

Je Ziel gilt eine eigene Umgebungsdatei: `.env.s1` (gitignored) landet auf
s1 als `.env`; darin zeigen die DB-Hosts auf `172.17.0.1` (Docker-Bridge,
also das PostgreSQL des Hosts). Das alte Ziel `./deploy-server.sh` (ohne
Argument) deployt weiterhin auf den Heimserver.

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

Noch offen: naechtlicher `pg_dump` auf s1 - bis dahin gibt es von den
Datenbanken keine automatischen Backups.
