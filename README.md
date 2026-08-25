# Energiegemeinschaft

Digital infrastructure of [ischlstrom.org](https://ischlstrom.org), an Austrian energy community (Energiegemeinschaft / EEG).

## Repository layout

* **website/** - SvelteKit 5 app: public site plus authenticated member, board and finance portals. The main deployed application (Docker, adapter-node).
* **middleware/** - Django project that owns and migrates the shared "middleware" PostgreSQL schema and provides the Django admin. The website reads and writes this database directly.
* **notebooks/** - Jupyter notebooks for accounting and SEPA XML generation (`finance/`), energy data import and analysis (`energyData/`, `eegfaktura/`), energy forecasting (`forecast/`) and weather import (`weather/`). See `notebooks/README.md`.
* **Batteriemanagement/** - OpenHAB scripts for battery control.
* **scripts/** - Shell scripts for database export, restore and backup.
* **docs/** - Server setup documentation.

## Architecture notes

* Two shared PostgreSQL databases: the middleware DB (schema managed by Django, used directly by the website via `pg`) and a separate Auth.js DB for sessions and users. In addition, per-member OpenHAB databases hold smart-meter and battery time series.
* Secrets and DB credentials live in gitignored files: `website/.env`, `.pg_service.conf`, `.pgpass`.
* Timezone is Europe/Vienna throughout.

See `CLAUDE.md` for a more detailed developer overview and common commands.

## License

Copyright 2024-2026 Erneuerbare-Energie-Gemeinschaft ISCHLSTROM. Licensed under the [European Union Public Licence v. 1.2](LICENSE) (EUPL-1.2, `SPDX-License-Identifier: EUPL-1.2`), a copyleft licence that also covers running modified versions as a network service. See `COPYRIGHT` for the notice and the [official EUPL page](https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12) for the German and other authentic language versions.
