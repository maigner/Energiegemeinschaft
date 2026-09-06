#!/usr/bin/env bash
# Exportiert die Daten fuer replay.js aus der Produktions-DB (nur lesen):
# 30 Tage Status-Historie je Anlage, die Prognose-Slots je Tag (jeweils der
# neueste Lauf, der an dem Tag vorlag) und die stuendliche Bewoelkung.
# Braucht `psql service=eeg-middleware` (siehe notebooks/.pg_service.conf).
set -euo pipefail
cd "$(dirname "$0")"
DAYS="${1:-30}"

psql service=eeg-middleware -X -At -F',' -c "
SELECT status_id, to_char(time AT TIME ZONE 'Europe/Vienna','YYYY-MM-DD HH24:MI') t,
       data->>'soc', data->>'pv_power_w', data->>'battery_power_w', data->>'grid_power_w', data->>'load_power_w',
       data->>'ladeleistung_kw', data->>'batterie_kapazitaet', data->>'wolkenvorschau',
       data->>'ladesperre_start', data->>'ladesperre_ende', data->>'ladesperre_datum',
       data->>'laderegelung_soll_w', data->>'restladezeit_h',
       data->>'crossover_start', data->>'crossover_ende', data->>'entladestart', data->>'hauptschalter'
  FROM members_openhabstatushistory
 WHERE time > now() - interval '${DAYS} days'
 ORDER BY status_id, time" > history.csv
echo "history.csv: $(wc -l < history.csv) Zeilen"

psql service=eeg-middleware -X -At -F',' -c "
WITH days AS (SELECT generate_series((now() AT TIME ZONE 'Europe/Vienna')::date - ${DAYS}, (now() AT TIME ZONE 'Europe/Vienna')::date, '1 day')::date d),
runs AS (SELECT id, created_at FROM metering_energyforecastrun WHERE model_version NOT LIKE '%hindcast%'),
pick AS (SELECT d, (SELECT id FROM runs WHERE (created_at AT TIME ZONE 'Europe/Vienna')::date <= d ORDER BY created_at DESC LIMIT 1) run_id FROM days),
runmax AS (SELECT run_id, MAX(generation_kwh) mg FROM metering_energyforecast GROUP BY run_id)
SELECT p.d, p.run_id, to_char(f.timestamp AT TIME ZONE 'Europe/Vienna','HH24:MI') t,
       round(f.generation_kwh::numeric,3), round(f.consumption_kwh::numeric,3), round(rm.mg::numeric,3)
  FROM pick p
  JOIN metering_energyforecast f ON f.run_id = p.run_id AND (f.timestamp AT TIME ZONE 'Europe/Vienna')::date = p.d
  JOIN runmax rm ON rm.run_id = p.run_id
 ORDER BY p.d, f.timestamp" > forecast_days.csv
echo "forecast_days.csv: $(wc -l < forecast_days.csv) Zeilen"

psql service=eeg-middleware -X -At -F',' -c "
SELECT to_char(time AT TIME ZONE 'Europe/Vienna','YYYY-MM-DD HH24:MI'), cloud_cover
  FROM weather_weatherdata
 WHERE time > now() - interval '$((DAYS + 1)) days'
 ORDER BY time" > clouds.csv
echo "clouds.csv: $(wc -l < clouds.csv) Zeilen"
