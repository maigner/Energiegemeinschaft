import { middlewareDbConnection } from "$lib/server/db/db";

/**
 * Energieprognose (notebooks/forecast/eeg_forecast.py).
 *
 * Die Prognose wird nicht hier gerechnet, sondern in Python nach jedem
 * EEG-Faktura-Import mit `eeg_forecast.py --store` in die Tabellen
 * metering_energyforecastrun / metering_energyforecast geschrieben. Hier wird
 * nur der jeweils neueste Lauf gelesen.
 */

/** Läufe, die rückwirkend nachgerechnet wurden, sind kein Echtbetrieb. */
const LIVE_RUN = "model_version NOT LIKE '%hindcast%'";

export const getLatestForecastRun = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT id, created_at, model_version, data_until, horizon_start, horizon_end, parameters
        FROM metering_energyforecastrun
        WHERE ${LIVE_RUN}
        ORDER BY created_at DESC
        LIMIT 1
    `);
    sql.release();
    return result?.rows?.[0] ?? null;
};

/**
 * Stundenwerte des Laufs -- die 15-Minuten-Auflösung ist für die Anzeige zu
 * fein (672 Punkte je Woche).
 */
export const getForecastHours = async (runId: number, days: number = 7) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            date_trunc('hour', timestamp AT TIME ZONE 'Europe/Vienna') AT TIME ZONE 'Europe/Vienna' AS hour,
            SUM(consumption_kwh) AS consumption_kwh,
            SUM(generation_kwh) AS generation_kwh,
            SUM(self_coverage_kwh) AS self_coverage_kwh,
            SUM(surplus_kwh) AS surplus_kwh,
            SUM(generation_kwh_p10) AS generation_kwh_p10,
            SUM(generation_kwh_p90) AS generation_kwh_p90
        FROM metering_energyforecast
        WHERE run_id = $1
          AND timestamp >= date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') AT TIME ZONE 'Europe/Vienna'
          AND timestamp < (date_trunc('day', now() AT TIME ZONE 'Europe/Vienna') + ($2 || ' days')::interval) AT TIME ZONE 'Europe/Vienna'
        GROUP BY 1
        ORDER BY 1
    `, [runId, days]);
    sql.release();
    return result?.rows ?? [];
};

/** Tagessummen ab heute, für Tabelle und Kennzahlen. */
export const getForecastDays = async (runId: number, days: number = 10) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT
            (timestamp AT TIME ZONE 'Europe/Vienna')::date AS day,
            COUNT(*)::int AS intervals,
            SUM(consumption_kwh) AS consumption_kwh,
            SUM(generation_kwh) AS generation_kwh,
            SUM(self_coverage_kwh) AS self_coverage_kwh,
            SUM(surplus_kwh) AS surplus_kwh,
            MAX(n_consumption_points) AS n_consumption_points,
            MAX(n_generation_points) AS n_generation_points
        FROM metering_energyforecast
        WHERE run_id = $1
          AND (timestamp AT TIME ZONE 'Europe/Vienna')::date >= (now() AT TIME ZONE 'Europe/Vienna')::date
        GROUP BY 1
        HAVING COUNT(*) = 96
        ORDER BY 1
        LIMIT $2
    `, [runId, days]);
    sql.release();
    return result?.rows ?? [];
};

/**
 * Ladesperre-Fenster für das Batteriemanagement (IBM): vom ersten
 * nennenswerten Sonnenschein (Erzeugung über 5 % des Tagesmaximums) bis in
 * die Mittagsspitze. Die Idee: die morgendliche Verbrauchsspitze soll direkt
 * aus der PV gedeckt werden, und die Batterien laden mitten in der
 * Überschussspitze -- das vermeidet ein Zurückkippen der Gemeinschaft ins
 * Defizit direkt nach dem Crossover, fängt beim Mitglied Abregelungsverluste
 * und verkürzt die Standzeit bei 100 % SoC.
 *
 * Das Ende ist der spätere von Vormittags-Crossover (Erzeugung >= Verbrauch)
 * und dem ersten Slot mit Überschuss >= 75 % des Tagesmaximums, aber nie
 * später als der Spitzen-Slot selbst und nie nach 14:00 (die Steuerung am Pi
 * ignoriert Enden ab 15:00 ganz, dann gäbe es gar keine Sperre). Dieses Ende
 * ist die Community-Sicht und zugleich nur der Rückfall: Anlagen mit
 * belastbarer Kapazitäts- und Ladeleistungsschätzung ersetzen es lokal durch
 * ihr selbst berechnetes Ende (lokale Ladesperre in
 * Batteriemanagement/openhab/control/core.js), damit die Batterie am Abend
 * sicher voll wird -- ob eine Anlage rechtzeitig voll wird, kann nur sie
 * selbst beurteilen, nicht die Community-Prognose. An Tagen ohne erwarteten
 * Überschuss ist `ende` null -- dann gibt es keine Sperre.
 */
export const getTodayChargeWindow = async (runId: number) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        WITH slots AS (
            SELECT
                timestamp AT TIME ZONE 'Europe/Vienna' AS ts_local,
                generation_kwh,
                consumption_kwh,
                generation_kwh - consumption_kwh AS surplus_kwh
            FROM metering_energyforecast
            WHERE run_id = $1
              AND (timestamp AT TIME ZONE 'Europe/Vienna')::date = (now() AT TIME ZONE 'Europe/Vienna')::date
        ),
        peak AS (
            SELECT MAX(generation_kwh) AS max_gen,
                   MAX(surplus_kwh) AS max_surplus
            FROM slots
        ),
        crossover AS (
            SELECT MIN(ts_local) AS t
            FROM slots
            WHERE generation_kwh >= consumption_kwh
              AND EXTRACT(hour FROM ts_local) >= 3
        ),
        extended AS (
            SELECT CASE WHEN (SELECT t FROM crossover) IS NULL THEN NULL
                ELSE LEAST(
                    GREATEST(
                        (SELECT t FROM crossover),
                        (SELECT MIN(ts_local) FROM slots, peak
                          WHERE peak.max_surplus > 0
                            AND surplus_kwh >= 0.75 * peak.max_surplus
                            AND EXTRACT(hour FROM ts_local) >= 3)
                    ),
                    (SELECT MIN(ts_local) FROM slots, peak
                      WHERE peak.max_surplus > 0
                        AND surplus_kwh = peak.max_surplus),
                    (now() AT TIME ZONE 'Europe/Vienna')::date + time '14:00'
                ) END AS t
        )
        SELECT
            COUNT(*)::int AS intervals,
            to_char((now() AT TIME ZONE 'Europe/Vienna')::date, 'YYYY-MM-DD') AS datum,
            to_char(MIN(ts_local) FILTER (
                WHERE generation_kwh > 0.05 * (SELECT max_gen FROM peak)
            ), 'HH24:MI') AS start,
            to_char((SELECT t FROM extended), 'HH24:MI') AS ende
        FROM slots
    `, [runId]);
    sql.release();
    const row = result?.rows?.[0];
    if (!row || !row.intervals) return null;
    return row;
};

// --- Individualisiertes Ladesperre-Ende (Token-API /api/ibm/ladefenster) ----
// Rechnet das Sperr-Ende je Anlage statt für die Gemeinschaft: rückwärts von
// der Abend-Deadline wird das normierte Erzeugungsprofil des Prognosetags,
// skaliert mit der gepushten Ladeleistung der Anlage, aufintegriert, bis die
// fehlende Energie (Anteil der gepushten Batteriekapazität mal Sicherheits-
// faktor) gedeckt ist. Das Community-Profil dient nur als Tagesform (wann ist
// die Sonne wie stark); Amplitude und Batteriegröße kommen von der Anlage.
// Die Parameter liegen bewusst hier am Server: Tuning braucht so kein
// IBM-Paket-Update auf den Anlagen.

// Fehlende Energie am Morgen: der Wechselrichter versorgt nach dem
// Entlade-Stopp das Haus weiter aus der Batterie bis zu seiner eigenen
// Reserve von wenigen Prozent - unabhängig vom eingestellten Mindest-SoC.
const IBM_CHARGE_FRACTION = 0.95;
// Sicherheitsaufschlag auf die benötigte Energie (Prognosefehler, Dunst).
const IBM_SAFETY_FACTOR = 1.3;
// So viele Minuten vor dem abendlichen Crossover soll die Batterie voll sein.
const IBM_FULL_BUFFER_MIN = 60;
// Später endet keine Sperre (die Steuerung am Pi ignoriert Enden ab 15:00).
const IBM_LATEST_END_MIN = 14 * 60;

// --- Nacht-Entladebudget ----------------------------------------------------
// Eingespeist werden darf nachts nur, was der kommende Tag der Anlage sicher
// wieder in die Batterie lädt - sonst speist ein Mitglied nachts für die
// Gemeinschaft ein und muss am trüben Folgetag selbst Strom zukaufen. Vom
// ladbaren Tagesertrag geht eine Eigenbedarfsreserve ab: die Hauslast über
// jene Stunden der nächsten 24, in denen die Gemeinschaft laut Prognose
// keinen Überschuss hat (Erzeugung unter Verbrauch) - nachts immer, an einem
// trüben Folgetag auch tagsüber. Das Wetter des Folgetags steckt so genau
// einmal im Budget (ladbarer Ertrag und Reservedauer) und nicht zusätzlich
// als pauschaler 24-Stunden-Zuschlag, der selbst an klaren Tagen jedes
// Budget auf null drücken würde. Der Rest wird wegen der Prognosefehler nur
// mit Abschlag freigegeben. Bei einer Mehrtages-Schlechtwetterfront ist das
// Budget mehrere Tage in Folge 0 - die Batterie bleibt dem eigenen Haus.
const IBM_NIGHT_BUDGET_DISCOUNT = 0.8;
// Hauslast-Annahme in Watt, solange die Anlage noch keine gelernte Hauslast
// gepusht hat: typische nächtliche Grundlast eines Haushalts.
export const IBM_FALLBACK_HOUSE_LOAD_W = 300;

const fmtMinutes = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h < 10 ? "0" : ""}${h}:${mm < 10 ? "0" : ""}${mm}`;
};

/**
 * Referenz für die Normierung der Erzeugungsprofile: der höchste
 * 15-Minuten-Slot des gesamten Prognoselaufs (~30 Tage, enthält praktisch
 * immer nahezu klare Tage). Gegen den eigenen Tagesspitzenwert zu normieren
 * wäre falsch: ein trüber Tag sähe dann aus wie ein klarer.
 */
const getRunMaxGeneration = async (runId: number) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT MAX(generation_kwh) AS max_gen
        FROM metering_energyforecast
        WHERE run_id = $1
    `, [runId]);
    sql.release();
    const maxGen = Number(result?.rows?.[0]?.max_gen);
    return Number.isFinite(maxGen) && maxGen > 0 ? maxGen : null;
};

/**
 * Individualisiertes Ladesperre-Ende ("HH:MM") für eine Anlage mit der
 * gegebenen Batteriekapazität und Ladeleistung - oder null, wenn die Anlage
 * laut Profil den ganzen Tag zum Laden braucht (dann keine Sperre) oder der
 * Prognosetag keine Berechnung hergibt (kein Profil, keine Erzeugung, kein
 * abendlicher Crossover). Plausibilität der Eingaben prüft der Aufrufer.
 */
export const getIndividualChargeWindowEnd = async (
    runId: number,
    capacityKwh: number,
    chargeRateKw: number
) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT (EXTRACT(hour FROM timestamp AT TIME ZONE 'Europe/Vienna') * 60
              + EXTRACT(minute FROM timestamp AT TIME ZONE 'Europe/Vienna'))::int AS minute_of_day,
               generation_kwh,
               consumption_kwh
        FROM metering_energyforecast
        WHERE run_id = $1
          AND (timestamp AT TIME ZONE 'Europe/Vienna')::date = (now() AT TIME ZONE 'Europe/Vienna')::date
        ORDER BY 1
    `, [runId]);
    sql.release();

    const slots = (result?.rows ?? []).map((r: any) => ({
        minute: Number(r.minute_of_day),
        gen: Number(r.generation_kwh),
        cons: Number(r.consumption_kwh),
    }));
    if (slots.length === 0) return null;

    // Normierung gegen den besten Slot des Laufs: an trüben Tagen liegt das
    // Profil dann realistisch niedrig und das Ende rückt nach vorne.
    const maxGen = await getRunMaxGeneration(runId);
    if (maxGen === null) return null;

    // Abendlicher Crossover: Ende des letzten Slots, in dem die Erzeugung
    // den Verbrauch noch deckt.
    let crossoverEnd: number | null = null;
    for (const s of slots) {
        if (s.gen >= s.cons) crossoverEnd = s.minute + 15;
    }
    if (crossoverEnd === null) return null;

    const deadline = crossoverEnd - IBM_FULL_BUFFER_MIN;
    const neededKwh = capacityKwh * IBM_CHARGE_FRACTION * IBM_SAFETY_FACTOR;

    // Rückwärts von der Deadline: Ladeleistung im Slot = Spitzenrate der
    // Anlage mal normierter Erzeugung. Sobald die aufsummierte Energie
    // reicht, ist der Slotbeginn das späteste Sperr-Ende.
    let cumKwh = 0;
    for (let i = slots.length - 1; i >= 0; i--) {
        const s = slots[i];
        if (s.minute + 15 > deadline) continue;
        cumKwh += chargeRateKw * (s.gen / maxGen) * 0.25;
        if (cumKwh >= neededKwh) {
            return fmtMinutes(Math.min(s.minute, IBM_LATEST_END_MIN));
        }
    }
    return null;
};

/**
 * Stündliche Ladefaktoren (0..1) des heutigen Tages für die dynamische
 * Laderegelung der IBM-Anlagen: je Stunde das Mittel der vier
 * 15-Minuten-Slots von Erzeugung / bestem Slot des Laufs -- dieselbe
 * Normierung wie beim individualisierten Sperr-Ende. Die Steuerung am Pi
 * multipliziert den Faktor mit ihrer gelernten Ladeleistung und integriert
 * so die effektive Restladezeit bis zur Abend-Deadline (Crossover-Ende
 * minus Puffer), die hier mitgeliefert wird. Geliefert werden die Stunden
 * von der laufenden Stunde bis zur Deadline-Stunde. null, wenn der
 * Prognosetag keine Berechnung hergibt (keine Slots, keine Erzeugung, kein
 * abendlicher Crossover).
 */
export const getChargeFactorsToday = async (runId: number) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT (EXTRACT(hour FROM timestamp AT TIME ZONE 'Europe/Vienna') * 60
              + EXTRACT(minute FROM timestamp AT TIME ZONE 'Europe/Vienna'))::int AS minute_of_day,
               generation_kwh,
               consumption_kwh
        FROM metering_energyforecast
        WHERE run_id = $1
          AND (timestamp AT TIME ZONE 'Europe/Vienna')::date = (now() AT TIME ZONE 'Europe/Vienna')::date
        ORDER BY 1
    `, [runId]);
    sql.release();

    const slots = (result?.rows ?? []).map((r: any) => ({
        minute: Number(r.minute_of_day),
        gen: Number(r.generation_kwh),
        cons: Number(r.consumption_kwh),
    }));
    if (slots.length === 0) return null;

    const maxGen = await getRunMaxGeneration(runId);
    if (maxGen === null) return null;

    let crossoverEnd: number | null = null;
    for (const s of slots) {
        if (s.gen >= s.cons) crossoverEnd = s.minute + 15;
    }
    if (crossoverEnd === null) return null;
    const deadline = crossoverEnd - IBM_FULL_BUFFER_MIN;

    const nowMinute = (() => {
        const parts = new Intl.DateTimeFormat('de-AT', {
            timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(new Date());
        const h = Number(parts.find(p => p.type === 'hour')?.value);
        const m = Number(parts.find(p => p.type === 'minute')?.value);
        return h * 60 + m;
    })();

    const perHour = new Map<number, { sum: number; n: number }>();
    for (const s of slots) {
        const hour = Math.floor(s.minute / 60);
        if ((hour + 1) * 60 <= Math.floor(nowMinute / 60) * 60) continue; // Stunde vorbei
        if (hour * 60 >= deadline) continue;                              // nach der Deadline
        const acc = perHour.get(hour) ?? { sum: 0, n: 0 };
        acc.sum += Math.min(Math.max(s.gen / maxGen, 0), 1);
        acc.n += 1;
        perHour.set(hour, acc);
    }
    if (perHour.size === 0) return null;

    const stunden = [...perHour.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([hour, acc]) => ({
            zeit: fmtMinutes(hour * 60),
            faktor: Math.round(acc.sum / acc.n * 1000) / 1000,
        }));

    return { deadline: fmtMinutes(deadline), stunden };
};

/**
 * Nacht-Entladebudget in kWh für eine Anlage: was der kommende Tag laut
 * Prognoseprofil in die Batterie laden kann (Ladeleistung mal normierte
 * Erzeugung der nächsten 24 Stunden), abzüglich Eigenbedarfsreserve
 * (Hauslast mal Stunden ohne Gemeinschafts-Überschuss in denselben 24
 * Stunden) und mit Abschlag (Konstanten oben). Die Steuerung am Pi entlädt
 * nachts nur bis "Abend-Ladestand minus Budget". null, wenn der Lauf keine
 * Slots für die nächsten 24 Stunden hat.
 */
export const getNightDischargeBudget = async (
    runId: number,
    chargeRateKw: number,
    houseLoadW: number
) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT generation_kwh, consumption_kwh
        FROM metering_energyforecast
        WHERE run_id = $1
          AND timestamp > now()
          AND timestamp <= now() + interval '24 hours'
    `, [runId]);
    sql.release();

    const rows = result?.rows ?? [];
    if (rows.length === 0) return null;

    const maxGen = await getRunMaxGeneration(runId);
    if (maxGen === null) return null;

    let chargeableKwh = 0;
    let reserveHours = 0;
    for (const r of rows) {
        const gen = Number(r.generation_kwh);
        chargeableKwh += chargeRateKw * (gen / maxGen) * 0.25;
        // Ohne Gemeinschafts-Überschuss haengt das Haus an der Batterie.
        if (gen <= Number(r.consumption_kwh)) reserveHours += 0.25;
    }
    const reserveKwh = (houseLoadW / 1000) * reserveHours;
    const budget = Math.max(0, chargeableKwh - reserveKwh) * IBM_NIGHT_BUDGET_DISCOUNT;
    return Math.round(budget * 10) / 10;
};

/**
 * Durchschnittlicher nächtlicher Strombedarf laut Prognose, für die
 * IBM-Seite: je vollständigem Prognosetag die Summe von Verbrauch minus
 * Eigendeckung in den Intervallen ohne nennenswerte Sonne (Erzeugung unter
 * 5 % des Tagesmaximums, gleiche Schwelle wie beim Ladesperre-Fenster),
 * gemittelt über alle Tage des Laufs. Das ist die Energiemenge, die die
 * Batterien der Mitglieder decken müssten, damit nachts kein Mitglied
 * einzeln Strom vom eigenen Anbieter beziehen muss (die EEG selbst kauft
 * nie Strom zu).
 */
export const getForecastNightDeficit = async (runId: number) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        WITH slots AS (
            SELECT
                (timestamp AT TIME ZONE 'Europe/Vienna')::date AS day,
                generation_kwh,
                consumption_kwh,
                self_coverage_kwh,
                MAX(generation_kwh) OVER (
                    PARTITION BY (timestamp AT TIME ZONE 'Europe/Vienna')::date
                ) AS day_peak
            FROM metering_energyforecast
            WHERE run_id = $1
        ),
        nights AS (
            SELECT
                day,
                SUM(GREATEST(consumption_kwh - self_coverage_kwh, 0)) FILTER (
                    WHERE generation_kwh <= 0.05 * day_peak
                ) AS night_deficit_kwh
            FROM slots
            GROUP BY day
            HAVING COUNT(*) = 96
        )
        SELECT
            COUNT(*)::int AS days,
            AVG(night_deficit_kwh)::float AS avg_night_deficit_kwh
        FROM nights
    `, [runId]);
    sql.release();
    const row = result?.rows?.[0];
    if (!row?.days || row.avg_night_deficit_kwh == null) return null;
    return row;
};

/**
 * Prognose gegen tatsächlich gemessene Werte. Je Tag zählt der Lauf, der ihm am
 * nächsten lag.
 *
 * `actual_is_complete` wirft unvollständig gelieferte Tage raus -- sie sähen
 * sonst wie ein riesiger Prognosefehler aus. Seit der neuen Datenanbindung
 * (Juli 2026) gelten gelieferte Messwerte als verlässlich; die frühere
 * 120-Tage-Wartefrist (`actual_is_mature`) gibt es nicht mehr.
 */
export const getForecastAccuracy = async (limit: number = 30) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        SELECT * FROM (
            SELECT DISTINCT ON (day)
                day, days_ahead, run_id, run_created_at, data_until, model_version,
                used_measured_weather,
                consumption_forecast::float AS consumption_forecast,
                consumption_actual::float AS consumption_actual,
                generation_forecast::float AS generation_forecast,
                generation_actual::float AS generation_actual,
                self_coverage_forecast::float AS self_coverage_forecast,
                self_coverage_actual::float AS self_coverage_actual
            FROM energy_forecast_vs_actual
            WHERE actual_is_complete
              AND intervals = 96
              AND consumption_actual IS NOT NULL
              AND days_ahead > 0
            ORDER BY day, days_ahead
        ) evaluated
        ORDER BY day DESC
        LIMIT $1
    `, [limit]);
    sql.release();
    return (result?.rows ?? []).reverse();
};
