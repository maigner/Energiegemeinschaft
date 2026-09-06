* energyData: EEG-Faktura energy data (`eegfaktura_import.py` via API, notebook = xlsx fallback)
* eegfaktura: API spike (superseded by energyData/eegfaktura_import.py)
* forecast: energy forecast (see README there)
* weather: Open-Meteo import
* finance: SEPA XML

Credentials for the EEG-Faktura API go into `notebooks/.env` (template `.env.example`, gitignored).
