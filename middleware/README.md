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