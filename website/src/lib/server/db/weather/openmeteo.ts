import { fetchWeatherApi } from 'openmeteo';
import { middlewareDbConnection } from "$lib/server/db/db";

const LATITUDE = 47.7111;
const LONGITUDE = 13.6189;

/**
 * Open-Meteo variables to fetch. The names are identical to the column names in
 * weather_weatherdata, so the order of this array defines the order of both the
 * API response and the SQL parameters.
 *
 * The radiation values are what the energy forecast runs on -- shortwave_radiation
 * alone accounts for roughly 80 % of the explanatory power of the PV model
 * (see notebooks/forecast/README.md), cloud cover is a poor substitute.
 */
const VARIABLES = [
    'temperature_2m',
    'cloud_cover',
    'rain',
    'snowfall',
    'snow_depth',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'relative_humidity_2m',
    'dew_point_2m',
    'shortwave_radiation',
    'direct_radiation',
    'diffuse_radiation',
    'direct_normal_irradiance',
    'sunshine_duration',
    'wind_speed_10m',
    'precipitation',
    'apparent_temperature',
    'snow_depth_water_equivalent',
] as const;

/** Columns that are NOT NULL in the table -- hours missing one of them cannot be inserted. */
const REQUIRED = [
    'temperature_2m', 'cloud_cover', 'rain', 'snowfall', 'snow_depth', 'cloud_cover_low',
    'cloud_cover_mid', 'cloud_cover_high', 'relative_humidity_2m', 'dew_point_2m',
];

type HourRow = { time: Date; values: (number | null)[] };

/**
 * One model run as rows. `null` is used for everything the model does not
 * deliver -- AROME for instance has no snow_depth, and the last hours of a run
 * are frequently empty.
 */
async function fetchModel(model: string, pastDays: number, forecastDays: number): Promise<HourRow[]> {
    const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', {
        latitude: LATITUDE,
        longitude: LONGITUDE,
        hourly: [...VARIABLES],
        past_days: pastDays,
        forecast_days: forecastDays,
        models: model,
    });

    const response = responses[0];
    const utcOffsetSeconds = response.utcOffsetSeconds();
    const hourly = response.hourly();

    if (hourly === null) {
        console.error(`[weather] no hourly data received for model ${model}`);
        return [];
    }

    const columns = VARIABLES.map((_, index) => hourly.variables(index)?.valuesArray() ?? null);
    const count = (Number(hourly.timeEnd()) - Number(hourly.time())) / hourly.interval();

    const rows: HourRow[] = [];
    for (let i = 0; i < count; i++) {
        const seconds = Number(hourly.time()) + i * hourly.interval() + utcOffsetSeconds;
        rows.push({
            time: new Date(seconds * 1000),
            // missing values arrive as NaN from the flatbuffer response
            values: columns.map(column => {
                const value = column?.[i];
                return value === undefined || !Number.isFinite(value) ? null : value;
            }),
        });
    }
    return rows;
}

/** Arrays per column, as expected by the UNNEST based statements. */
function toColumnArrays(rows: HourRow[]) {
    return [
        rows.map(row => row.time),
        ...VARIABLES.map((_, index) => rows.map(row => row.values[index])),
    ];
}

/** Insert or fully overwrite the given hours. */
async function upsertRows(rows: HourRow[], label: string) {
    const complete = rows.filter(row =>
        REQUIRED.every(column => row.values[VARIABLES.indexOf(column as typeof VARIABLES[number])] !== null)
    );
    const skipped = rows.length - complete.length;
    if (complete.length === 0) {
        console.log(`[weather] ${label}: nothing to insert (${skipped} incomplete hours)`);
        return;
    }

    const unnests = ['UNNEST($1::timestamptz[])',
        ...VARIABLES.map((_, index) => `UNNEST($${index + 2}::float[])`)];
    const updates = VARIABLES.map(column => `${column} = EXCLUDED.${column}`).join(',\n        ');

    const sql = await middlewareDbConnection();
    try {
        await sql.query(`
      INSERT INTO weather_weatherdata (time, ${VARIABLES.join(', ')})
      SELECT ${unnests.join(', ')}
      ON CONFLICT (time) DO UPDATE SET
        ${updates}
    `, toColumnArrays(complete));
        console.log(`[weather] ${label}: upserted ${complete.length} rows, skipped ${skipped} incomplete`);
    } catch (error) {
        console.error(`[weather] ${label}: error while upserting data:`, error);
    } finally {
        sql.release();
    }
}

/**
 * Refine already stored hours with a higher resolution model. Only existing rows
 * are touched and only where the model actually delivers a value, so a model
 * without snow depth does not wipe the snow depth of the coarser run.
 */
async function refineRows(rows: HourRow[], label: string) {
    if (rows.length === 0) return;

    const unnests = ['UNNEST($1::timestamptz[]) AS time',
        ...VARIABLES.map((column, index) => `UNNEST($${index + 2}::float[]) AS ${column}`)];
    const updates = VARIABLES.map(column => `${column} = COALESCE(u.${column}, w.${column})`).join(',\n        ');

    const sql = await middlewareDbConnection();
    try {
        const result = await sql.query(`
      UPDATE weather_weatherdata w SET
        ${updates}
      FROM (SELECT ${unnests.join(', ')}) u
      WHERE w.time = u.time
    `, toColumnArrays(rows));
        console.log(`[weather] ${label}: refined ${result.rowCount} rows`);
    } catch (error) {
        console.error(`[weather] ${label}: error while refining data:`, error);
    } finally {
        sql.release();
    }
}

/**
 * Keeps weather_weatherdata up to date.
 *
 * Two passes on purpose:
 *  1. the global model reaches 16 days ahead and delivers every variable,
 *  2. AROME Austria is the far better local model but stops after ~3 days and
 *     has no snow depth, so it only refines what pass 1 already wrote.
 *
 * `past_days` makes the job self healing: a missed run is filled in on the next
 * one instead of leaving a permanent hole. Longer outages are backfilled with
 * notebooks/weather/backfill_openmeteo.py.
 */
export async function fetchAndStoreWeatherData() {
    const global = await fetchModel('best_match', 7, 16);
    await upsertRows(global, 'best_match');

    const arome = await fetchModel('geosphere_arome_austria', 2, 3);
    await refineRows(arome, 'arome_austria');
}
