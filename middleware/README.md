# materialized views

select EXTRACT(YEAR FROM m.timestamp) AS year,
EXTRACT(WEEK FROM m.timestamp) AS week,
sum(m.value)                   as sum_in_kwh,
m.meter_code_id,
mc.description
from metering_measurement m
join public.metering_metercode mc on mc.id = m.meter_code_id
group by EXTRACT(YEAR FROM m.timestamp), EXTRACT(WEEK FROM m.timestamp), m.meter_code_id, mc.description
order by year, week;

-- weekly sums query
drop materialized view weekly_metering_summary;
CREATE MATERIALIZED VIEW weekly_metering_summary AS
SELECT EXTRACT(YEAR FROM m.timestamp) AS year,
EXTRACT(WEEK FROM m.timestamp) AS week,
SUM(m.value)                   AS sum_in_kwh,
m.meter_code_id,
mc.description
FROM metering_measurement m
JOIN
public.metering_metercode mc ON mc.id = m.meter_code_id
GROUP BY EXTRACT(YEAR FROM m.timestamp),
EXTRACT(WEEK FROM m.timestamp),
m.meter_code_id,
mc.description
ORDER BY year,
week;

CREATE INDEX idx_weekly_metering_summary_year_week ON weekly_metering_summary (year, week, meter_code_id);


CREATE MATERIALIZED VIEW daily_metering_summary AS
SELECT
EXTRACT(YEAR FROM m.timestamp) AS year,
CAST(m.timestamp AS DATE) AS day,
SUM(m.value) AS sum_in_kwh,
m.meter_code_id,
mc.description
FROM metering_measurement m
JOIN metering_metercode mc ON mc.id = m.meter_code_id
GROUP BY EXTRACT(YEAR FROM m.timestamp), CAST(m.timestamp AS DATE), m.meter_code_id, mc.description
ORDER BY year, day;

CREATE INDEX idx_daily_metering_summary_year_day ON daily_metering_summary (year, day, meter_code_id);

# Prognose: Qualitätssicht und Soll-Ist-Vergleich

Für die Energieprognose (`notebooks/forecast/`) gibt es zwei weitere Views. Die
erste liefert Tagessummen samt Liefer-Qualität, die zweite stellt die
gespeicherten Prognosen den inzwischen eingetroffenen Messwerten gegenüber.

**`daily_metering_quality` muss nach jedem EEG-Faktura-Import mit-aktualisiert
werden** (`REFRESH MATERIALIZED VIEW daily_metering_quality;`), genauso wie die
beiden Summary-Views oben.

```sql
-- Tagessummen je Meter Code inklusive Liefer-Qualität.
-- Ein Tag gilt als vollständig, wenn mindestens 85 % der vorhandenen
-- Verbrauchs-Zählpunkte eine Tagessumme > 0 haben und es überhaupt mindestens
-- 30 Zählpunkte gibt (dieselbe Regel wie in notebooks/forecast/eeg_forecast.py). Unvollständig gelieferte
-- Exporte (Zeilen da, Werte 0) würden sonst wie ein Prognosefehler aussehen.
DROP MATERIALIZED VIEW IF EXISTS daily_metering_quality CASCADE;

CREATE MATERIALIZED VIEW daily_metering_quality AS
WITH per_point AS (
    SELECT (m.timestamp AT TIME ZONE 'Europe/Vienna')::date AS day,
           m.meter_code_id,
           m.measurement_point_id,
           SUM(m.value) AS kwh
    FROM metering_measurement m
    GROUP BY 1, 2, 3
),
aggregated AS (
    SELECT day,
           meter_code_id,
           SUM(kwh) AS sum_in_kwh,
           COUNT(*) AS n_points,
           COUNT(*) FILTER (WHERE kwh > 0) AS n_reporting
    FROM per_point
    GROUP BY 1, 2
),
quality AS (
    SELECT a.day,
           a.n_points AS n_consumption_points,
           a.n_reporting::float / NULLIF(a.n_points, 0) AS reporting_share
    FROM aggregated a
    JOIN metering_metercode mc ON mc.id = a.meter_code_id
    WHERE mc.description LIKE 'Gesamtverbrauch%'
)
SELECT a.day,
       a.meter_code_id,
       a.sum_in_kwh,
       a.n_points,
       a.n_reporting,
       q.reporting_share,
       (q.reporting_share >= 0.85 AND q.n_consumption_points >= 30) AS is_complete
FROM aggregated a
LEFT JOIN quality q ON q.day = a.day;

CREATE UNIQUE INDEX idx_daily_metering_quality ON daily_metering_quality (day, meter_code_id);

-- Prognose gegen Wirklichkeit, je Prognoselauf und Tag.
-- `days_ahead` ist der Abstand zum letzten Tag mit vollständigen Messdaten beim
-- Rechnen -- damit lässt sich auswerten, wie der Fehler mit dem Horizont wächst.
CREATE OR REPLACE VIEW energy_forecast_vs_actual AS
WITH forecast_daily AS (
    SELECT f.run_id,
           (f.timestamp AT TIME ZONE 'Europe/Vienna')::date AS day,
           COUNT(*) AS intervals,
           SUM(f.consumption_kwh) AS consumption_forecast,
           SUM(f.generation_kwh) AS generation_forecast,
           SUM(f.self_coverage_kwh) AS self_coverage_forecast,
           SUM(f.surplus_kwh) AS surplus_forecast
    FROM metering_energyforecast f
    GROUP BY 1, 2
),
actual_daily AS (
    SELECT q.day,
           MAX(q.reporting_share) AS reporting_share,
           BOOL_OR(q.is_complete) AS is_complete,
           SUM(q.sum_in_kwh) FILTER (WHERE mc.description LIKE 'Gesamtverbrauch%') AS consumption_actual,
           SUM(q.sum_in_kwh) FILTER (WHERE mc.description = 'Gesamte gemeinschaftliche Erzeugung') AS generation_actual,
           SUM(q.sum_in_kwh) FILTER (WHERE mc.description LIKE 'Eigendeckung%') AS self_coverage_actual,
           SUM(q.sum_in_kwh) FILTER (WHERE mc.description LIKE 'Gesamt/%berschusserzeugung%') AS surplus_actual
    FROM daily_metering_quality q
    JOIN metering_metercode mc ON mc.id = q.meter_code_id
    GROUP BY 1
)
SELECT f.run_id,
       r.created_at AS run_created_at,
       r.model_version,
       r.data_until,
       f.day,
       (f.day - r.data_until) AS days_ahead,
       f.intervals,
       f.consumption_forecast,
       a.consumption_actual,
       f.generation_forecast,
       a.generation_actual,
       f.self_coverage_forecast,
       a.self_coverage_actual,
       f.surplus_forecast,
       a.surplus_actual,
       a.reporting_share,
       COALESCE(a.is_complete, false) AS actual_is_complete,
       -- Tage, die beim Rechnen schon vorbei waren, verwenden das tatsächlich
       -- eingetretene Wetter statt einer Wettervorhersage. Sie fallen deshalb
       -- besser aus als eine echte Vorausschau.
       (f.day <= (r.created_at AT TIME ZONE 'Europe/Vienna')::date) AS used_measured_weather,
       -- Seit der neuen Datenanbindung (Juli 2026) gelten gelieferte Messwerte
       -- als verlässlich; eine Wartefrist gibt es nicht mehr. Die Spalte bleibt
       -- aus Kompatibilität mit älteren Abfragen bestehen und ist immer true.
       true AS actual_is_mature
FROM forecast_daily f
JOIN metering_energyforecastrun r ON r.id = f.run_id
LEFT JOIN actual_daily a ON a.day = f.day;
```

Beim Auswerten entscheidend ist `actual_is_complete` (Lieferung vollständig) — unvollständig
gelieferte Tage sähen sonst wie ein riesiger Prognosefehler aus. `actual_is_mature` war früher
eine 120-Tage-Wartefrist, weil die alten EEG-Faktura-Daten monatelang nachkorrigiert wurden;
seit der neuen Datenanbindung ist die Spalte konstant `true` und nur noch aus Kompatibilität da.

Auswertung, z. B. Fehler nach Prognosehorizont:

```sql
SELECT days_ahead,
       avg(abs(consumption_forecast - consumption_actual)) AS mae_kwh,
       count(*) AS tage
FROM energy_forecast_vs_actual
WHERE actual_is_complete AND intervals = 96
  AND consumption_actual IS NOT NULL
GROUP BY 1 ORDER BY 1;
```


# Crossover-Zeiten der Energiegemeinschaft

`energy_community_weekly_crossover_times` liefert je Kalenderwoche die
durchschnittlichen Uhrzeiten (Europe/Vienna), zu denen die gemeinschaftliche
Erzeugung (Meter Code 196) den Gesamtverbrauch (Meter Code 193) morgens über-
und abends unterschreitet. Gemittelt wird **über alle Jahre hinweg** (Gruppierung
nach Tag-des-Jahres → Kalenderwoche), die Sicht liefert also "typische" Zeiten
für diese Woche im Jahr — deshalb genügt der monatliche Refresh im Website-Cron
(`hooks.server.js`), und die aktuelle Woche hat immer eine Zeile, sobald
historische Daten existieren. Die Website liest sie in
`/api/eeginfo/crossover/v1`; das OpenHAB-Batteriemanagement steuert damit sein
Entladefenster.

```sql
DROP MATERIALIZED VIEW IF EXISTS energy_community_weekly_crossover_times;
CREATE MATERIALIZED VIEW energy_community_weekly_crossover_times AS
WITH local_measurements AS (
    SELECT (m."timestamp" AT TIME ZONE 'Europe/Vienna') AS ts_local,
           m.value,
           m.meter_code_id
    FROM metering_measurement m
    WHERE m.meter_code_id IN (193, 196)
), daily_slots AS (
    SELECT EXTRACT(doy FROM ts_local)::integer AS day_of_year,
           ('1970-01-01'::date + ts_local::time) AS time_slot,
           avg(value) FILTER (WHERE meter_code_id = 193) AS gesamtverbrauch,
           avg(value) FILTER (WHERE meter_code_id = 196) AS gesamte_gem_erzeugung
    FROM local_measurements
    GROUP BY 1, 2
), crossovers_per_day AS (
    SELECT day_of_year, time_slot, gesamtverbrauch, gesamte_gem_erzeugung,
           (gesamte_gem_erzeugung > gesamtverbrauch) AS is_over,
           lag(gesamte_gem_erzeugung > gesamtverbrauch)
               OVER (PARTITION BY day_of_year ORDER BY time_slot) AS prev_is_over
    FROM daily_slots
    WHERE gesamtverbrauch IS NOT NULL AND gesamte_gem_erzeugung IS NOT NULL
), crossover_times AS (
    SELECT day_of_year,
           min(time_slot) FILTER (WHERE is_over = true  AND prev_is_over = false) AS morning_crossover,
           min(time_slot) FILTER (WHERE is_over = false AND prev_is_over = true)  AS evening_crossover
    FROM crossovers_per_day
    GROUP BY day_of_year
), weekly AS (
    SELECT EXTRACT(week FROM ('2001-01-01'::date + (day_of_year - 1)))::integer AS week_number,
           to_char('1970-01-01'::date + make_interval(secs =>
               avg(EXTRACT(epoch FROM morning_crossover) - EXTRACT(epoch FROM '1970-01-01'::date))::double precision),
               'HH24:MI') AS avg_morning_crossover,
           to_char('1970-01-01'::date + make_interval(secs =>
               avg(EXTRACT(epoch FROM evening_crossover) - EXTRACT(epoch FROM '1970-01-01'::date))::double precision),
               'HH24:MI') AS avg_evening_crossover,
           round(avg(EXTRACT(epoch FROM morning_crossover) - EXTRACT(epoch FROM '1970-01-01'::date)) / 3600.0, 3) AS morning_hour,
           round(avg(EXTRACT(epoch FROM evening_crossover) - EXTRACT(epoch FROM '1970-01-01'::date)) / 3600.0, 3) AS evening_hour,
           count(DISTINCT day_of_year) AS days_averaged
    FROM crossover_times
    WHERE morning_crossover IS NOT NULL AND evening_crossover IS NOT NULL
    GROUP BY 1
)
SELECT week_number, avg_morning_crossover, avg_evening_crossover,
       morning_hour, evening_hour, days_averaged
FROM weekly
ORDER BY week_number;
