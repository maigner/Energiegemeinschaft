# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Digital infrastructure for **ischlstrom.org**, an Austrian energy community (Energiegemeinschaft / EEG). A monorepo of three loosely-coupled parts that share a common PostgreSQL database:

- **`website/`** — SvelteKit 5 app: public site + authenticated member/board/finance portals. This is the main deployed application. User-facing text is German.
- **`middleware/`** — Django project (`eeg`) that owns and migrates the shared "middleware" Postgres schema. Rarely run as a server; it's the schema authority + Django admin.
- **`notebooks/`** — Jupyter notebooks for accounting, energy analysis, weather, and SEPA XML generation (see per-directory READMEs).
- **`Batteriemanagement/`**, **`scripts/`** — OpenHAB battery-control scripts and DB export/restore shell scripts.

## Databases (important architecture)

Two shared PostgreSQL databases plus per-member OpenHAB databases:

1. **middleware DB** (`ischlstrom_middleware`) — schema is defined and migrated by the Django project in `middleware/`, but the SvelteKit app reads/writes it **directly via a `pg` pool** (`website/src/lib/server/db/db.js` → `middlewareDbPool`), *not* through Django. When changing tables, update Django models/migrations in `middleware/` AND the raw SQL in `website/src/lib/server/db/`.
2. **authjs DB** — session/user store for Auth.js (`authDbPool`, `@auth/pg-adapter`). Separate from the middleware DB.
3. **per-member OpenHAB DBs** — each `Member` can have an `OpenhabDb` row (host/port/creds) in the middleware DB. `openhabDbConnection(memberIdentifier)` in `db.js` lazily builds a connection pool per member to read their smart-meter/battery time-series.

DB credentials come from `website/.env` (gitignored). Notebooks and Django connect via a `.pg_service.conf` service named `eeg-middleware` (also gitignored, alongside `.pgpass`).

## website/ (SvelteKit 5 + Tailwind 4 + Flowbite)

Commands (run from `website/`):
- `npm run dev` — dev server (cron jobs are disabled in dev)
- `npm run build` — production build (adapter-node)
- `npm run preview` — preview the production build
- `npm run check` — type-check via `svelte-check` (uses `jsconfig.json`)
- `npm run start` — run the built server (PORT=8080, expects reverse-proxy headers)

There is no test runner and no lint script configured.

Deploy: `./deploy-server.sh` rsyncs the tree to the server; on the server `./update-docker-container.sh` rebuilds the Docker image and `./run-docker.sh` runs it (maps host 3000 → container 8080, TZ Europe/Vienna).

Key conventions:
- **Auth & authorization** live in `src/auth.ts` + `src/hooks.server.js`. Login is passwordless magic-link email via Nodemailer (`@auth/sveltekit`). Authorization is route-prefix based in `authorizationHandle`: route groups `/(website)/board`, `/finance`, `/zukunft`, and `/user` require a session and redirect to `/login` otherwise. Adding a new protected area means adding its prefix there.
- **Scheduled jobs** are registered with `node-cron` inside `cronHandle` in `hooks.server.js` (weather fetch, activation reminders, materialized-view refresh). Every job early-returns when `dev` is true. An `initialized` guard prevents double-scheduling under HMR.
- **Server-only DB/mail/nextcloud code** lives under `src/lib/server/` (organized by domain: `db/energy`, `db/finance`, `db/members`, `db/weather`, `mail`, `nextcloud`). Never import these from client code.
- Routing uses the `(website)` route group; `board/*` is the admin area. Dynamic user pages are `user/[memberId]`.
- `csrf.checkOrigin` is disabled in `svelte.config.js` (for the contact form) — noted as a TODO.

## middleware/ (Django)

Commands (run from `middleware/eeg/`, using the local `middleware/.venvDjango` virtualenv):
- `python manage.py migrate`
- `python manage.py makemigrations`
- `python manage.py runserver`
- `python manage.py createsuperuser`
- `python manage.py test` (test files are currently empty stubs)

Apps: `members` (Member, MeasurementPoint, OpenhabDb, BoardApproval, EventRegistration), `metering` (MeterCode, Measurement), `accounting` (Booking, BookingLabel, BookingAttachment), `weather` (WeatherData). URL config exposes `members/`, `accounting/`, and `admin/`.

The database uses `django.db.backends.postgresql` with `OPTIONS.service = "eeg-middleware"` (resolved from `.pg_service.conf`). `middleware/README.md` documents the SQL for the `weekly_metering_summary` / `daily_metering_summary` materialized views that the website charts read from.

## notebooks/

Analysis and back-office notebooks (run with the repo-root `.venv`). Notable areas: `finance/` (SEPA XML for direct debits/credits — `XML Lastschriften`, `XML Gutschriften`, George bank CSV import, tax/annual-close), `energyData/` (EEG-Faktura energy report loader), `weather/` (Open-Meteo import), `eegfaktura/` (EEG-Faktura API), `forecast/` (energy forecast — see below). Data files under these directories are gitignored.

`weather/backfill_openmeteo.py` is the canonical loader for `weather_weatherdata` (archive API for the past, forecast API for the rest, `--check` reports coverage gaps); the notebooks next to it only write the original eleven columns and are superseded.

`forecast/` predicts the community 15-min series for the days the EEG-Faktura export does not cover yet. `eeg_forecast.py` holds the logic (also runnable as a CLI), `Energieprognose.ipynb` drives it, `forecast/README.md` explains the model. `--store` writes a run to `metering_energyforecastrun` / `metering_energyforecast` (runs are never overwritten, which is what makes the later forecast-vs-actual comparison in the `energy_forecast_vs_actual` view possible); the website reads the newest run at `/vorhersage`. After each import run the notebook first (it refreshes `daily_metering_quality`), then `eeg_forecast.py --refresh --days 30 --store`. Three things to know when touching measurement data anywhere: some exports are only partially delivered (rows present, most points all-zero — `MIN_REPORTING_SHARE` detects that); the data keeps being corrected for months, so **only days older than ~4 months are final** (`DATA_MATURITY_DAYS`, `actual_is_mature` in the view) and anything that measures forecast quality must be restricted to those, otherwise data errors get reported as forecast errors; and `Anteil gemeinschaftliche Erzeugung` equals the total community generation, while `Eigendeckung` is what members actually consumed.

## Notes

- Timezone is **Europe/Vienna** throughout (Docker, OpenHAB pool `options`, weather data); several past commits fixed timezone bugs — be careful with date handling.
- Secrets/config live in gitignored files: `website/.env`, `.pg_service.conf`, `.pgpass`. `.dmp` DB dumps under `scripts/` are gitignored.