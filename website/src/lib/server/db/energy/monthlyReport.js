// @ts-nocheck
// Abfragen fuer den monatlichen Energiebericht an die Mitglieder
// (lib/server/mail/reports/). Alle Funktionen bekommen die Verbindung als
// erstes Argument (Pool oder Client mit .query) und importieren bewusst
// nichts aus $lib/$env, damit auch das CLI website/scripts/energy-report.js
// sie ohne SvelteKit verwenden kann.
//
// Monate werden als 'YYYY-MM' uebergeben, Monatsgrenzen liegen in
// Europe/Vienna (nicht UTC), sonst rutschen die ersten zwei Stunden des
// Monats in den Vormonat.

export const METER = {
    consumption: 193, // Gesamtverbrauch lt. Messung
    communityReceived: 195, // Eigendeckung: aus der Gemeinschaft bezogen
    production: 196, // Gesamte gemeinschaftliche Erzeugung (Einspeisung des Mitglieds)
    surplus: 197, // Ueberschuss: von der Gemeinschaft nicht abgenommen
};

const METER_IDS = Object.values(METER);

/** 'YYYY-MM' um n Monate verschieben. */
export function shiftMonth(month, n) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Anzahl der Tage eines Monats 'YYYY-MM'. */
export function daysInMonth(month) {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Der zuletzt abgeschlossene Monat in Europe/Vienna als 'YYYY-MM'. */
export function previousMonth(now = new Date()) {
    const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit',
    }).format(now); // 'YYYY-MM'
    return shiftMonth(local, -1);
}

const first = (month) => `${month}-01`;

const byMeter = (rows) => {
    const out = {};
    for (const r of rows) out[Number(r.meter_code_id)] = Number(r.kwh);
    return out;
};

// Gleiche Filterung wie getMetricTotals der Mitgliederseite (nur aktive
// Zaehlpunkte, unvollstaendig gelieferte Tage bleiben draussen), damit
// Bericht und Portal dieselben Zahlen zeigen.
const MEMBER_FROM = `
    from metering_measurement m
    inner join members_measurementpoint p on p.id = m.measurement_point_id
    inner join members_member member on member.id = p.member_id
    left join (
        select day, bool_or(is_complete) as is_complete
        from daily_metering_quality
        group by day
    ) quality on quality.day = (m.timestamp at time zone 'Europe/Vienna')::date
    where member.identifier = $1
    and p.status = 'ACTIVE'
    and m.meter_code_id = any($4::bigint[])
    and m.timestamp >= ($2::date)::timestamp at time zone 'Europe/Vienna'
    and m.timestamp < ($3::date)::timestamp at time zone 'Europe/Vienna'
    and coalesce(quality.is_complete, true)
`;

/**
 * kWh je Monat und Metrik fuer ein Mitglied, von fromMonth bis inklusive
 * toMonth. Ergebnis: { 'YYYY-MM': { 193: kWh, ..., days: n } }, days = Tage
 * mit Messwerten (Beitritt mitten im Monat ergibt einen Teilmonat).
 */
export async function getMemberMonthlyTotals(db, memberIdentifier, fromMonth, toMonth) {
    const result = await db.query(`
        select to_char(date_trunc('month', m.timestamp at time zone 'Europe/Vienna'), 'YYYY-MM') as month,
            m.meter_code_id, sum(m.value) as kwh,
            count(distinct (m.timestamp at time zone 'Europe/Vienna')::date) as days
        ${MEMBER_FROM}
        group by 1, 2
    `, [memberIdentifier, first(fromMonth), first(shiftMonth(toMonth, 1)), METER_IDS]);

    const out = {};
    for (const r of result.rows) {
        const entry = (out[r.month] ??= { days: 0 });
        entry[Number(r.meter_code_id)] = Number(r.kwh);
        entry.days = Math.max(entry.days, Number(r.days));
    }
    return out;
}

/** Tageswerte eines Monats: [{ day: 1..31, 193: kWh, ... }], ein Eintrag je Kalendertag. */
export async function getMemberDailyTotals(db, memberIdentifier, month) {
    const result = await db.query(`
        select extract(day from m.timestamp at time zone 'Europe/Vienna')::int as day,
            m.meter_code_id, sum(m.value) as kwh
        ${MEMBER_FROM}
        group by 1, 2
    `, [memberIdentifier, first(month), first(shiftMonth(month, 1)), METER_IDS]);

    const days = Array.from({ length: daysInMonth(month) }, (_, i) => ({ day: i + 1 }));
    for (const r of result.rows) days[r.day - 1][Number(r.meter_code_id)] = Number(r.kwh);
    return days;
}

/** Summen der ganzen Gemeinschaft fuer einen Monat samt Zaehlpunktanzahl. */
export async function getCommunityMonth(db, month) {
    const range = [first(month), first(shiftMonth(month, 1))];
    const sums = await db.query(`
        select meter_code_id, sum(sum_in_kwh) as kwh
        from daily_metering_summary
        where day >= $1::date and day < $2::date and meter_code_id = any($3::bigint[])
        group by meter_code_id
    `, [...range, METER_IDS]);
    const points = await db.query(`
        select max(n_points) filter (where meter_code_id = ${METER.consumption}) as consumption_points,
               max(n_points) filter (where meter_code_id = ${METER.production}) as production_points
        from daily_metering_quality
        where day >= $1::date and day < $2::date
    `, range);
    return {
        totals: byMeter(sums.rows),
        consumptionPoints: Number(points.rows[0]?.consumption_points ?? 0),
        productionPoints: Number(points.rows[0]?.production_points ?? 0),
    };
}

/**
 * Ueberschuss der Gemeinschaft je Stunde (Lokalzeit) im Monat, 24 Werte in
 * kWh. Daraus leitet der Bericht den Hinweis ab, wann Sonnenstrom uebrig war.
 * Laeuft ueber alle Erzeugungs-Zaehlpunkte, daher nur einmal je Lauf rufen.
 */
export async function getCommunitySurplusByHour(db, month) {
    const result = await db.query(`
        select extract(hour from m.timestamp at time zone 'Europe/Vienna')::int as hour,
            sum(m.value) as kwh
        from metering_measurement m
        where m.meter_code_id = ${METER.surplus}
        and m.timestamp >= ($1::date)::timestamp at time zone 'Europe/Vienna'
        and m.timestamp < ($2::date)::timestamp at time zone 'Europe/Vienna'
        group by 1
    `, [first(month), first(shiftMonth(month, 1))]);
    const hours = new Array(24).fill(0);
    for (const r of result.rows) hours[r.hour] = Number(r.kwh);
    return hours;
}

/**
 * true, wenn fuer jeden Tag des Monats vollstaendige Daten vorliegen. Die
 * EEG-Faktura-Lieferung haengt einige Tage nach, der Bericht wartet darauf.
 */
export async function isMonthComplete(db, month) {
    const result = await db.query(`
        select count(*) filter (where is_complete) as complete_days
        from daily_metering_quality
        where meter_code_id = ${METER.consumption}
        and day >= $1::date and day < $2::date
    `, [first(month), first(shiftMonth(month, 1))]);
    return Number(result.rows[0]?.complete_days ?? 0) >= daysInMonth(month);
}

/**
 * Mitglieder, die den Bericht fuer den Monat noch bekommen sollen: aktiver
 * Zaehlpunkt, nicht abgemeldet (members_member.energy_report), noch kein
 * Eintrag in members_energyreportlog. emails = null heisst alle, sonst nur
 * diese Adressen (Testphase).
 */
export async function getPendingReportRecipients(db, month, emails = null) {
    const result = await db.query(`
        select m.identifier, m.email, m.name,
            m.first_name as "firstName", m.last_name as "lastName"
        from members_member m
        where m.energy_report
        and exists (select 1 from members_measurementpoint p
                    where p.member_id = m.id and p.status = 'ACTIVE')
        and not exists (select 1 from members_energyreportlog l
                        where l.member_id = m.id and l.month = $1::date)
        and ($2::text[] is null or lower(trim(m.email)) = any($2::text[]))
        order by m.identifier
    `, [first(month), emails ? emails.map((e) => e.toLowerCase()) : null]);
    return result.rows;
}

export async function logReportSent(db, memberIdentifier, month, email) {
    await db.query(`
        insert into members_energyreportlog (member_id, month, email, sent_at)
        select id, $2::date, $3, now() from members_member where identifier = $1
        on conflict (member_id, month) do nothing
    `, [memberIdentifier, first(month), email]);
}

/** Mitglied fuer das CLI (ohne Filter auf Abmeldung und Versandprotokoll). */
export async function getReportMember(db, memberIdentifier) {
    const result = await db.query(`
        select identifier, email, name, first_name as "firstName", last_name as "lastName"
        from members_member where identifier = $1
    `, [memberIdentifier]);
    return result.rows[0] ?? null;
}

// ------------------------------------------------------ Speichermanagement
//
// Dauerhaft liegt je Anlage nur der Tagesendstand des Batterie-Einspeise-
// zaehlers vor (members_openhabcountersnapshot, siehe batteryGridFeedIn.js);
// der Statusverlauf mit Ladestand und Leistungen wird nach 30 Tagen
// geloescht und deckt den Berichtsmonat beim Versand nicht mehr ab.

// Tagesdeltas wie in batteryGridFeedIn.js: erster Schnappschuss zaehlt ab 0,
// ein Zaehlerreset (Sprung nach unten) ebenfalls.
const BATTERY_DELTAS = `
    WITH snaps AS (
        SELECT s.status_id, s.day, s.battery_grid_kwh AS kwh,
               lag(s.battery_grid_kwh) OVER (PARTITION BY s.status_id ORDER BY s.day) AS prev
        FROM members_openhabcountersnapshot s
    ), deltas AS (
        SELECT status_id, day,
               CASE WHEN prev IS NULL THEN kwh
                    WHEN kwh >= prev THEN kwh - prev
                    ELSE kwh END AS delta
        FROM snaps
    )
`;

/**
 * Batterie-Einspeisung eines Mitglieds im Monat (alle seine Anlagen):
 * { days: [{ day, kwh }], total, countedFromDay }. countedFromDay ist der
 * Tag im Monat, an dem der Zaehler in Betrieb ging (sonst null - der Monat
 * ist voll gezaehlt). null, wenn das Mitglied im Monat keinen Zaehler hat.
 */
export async function getMemberBatteryMonth(db, memberIdentifier, month) {
    const result = await db.query(`
        ${BATTERY_DELTAS}
        SELECT extract(day from d.day)::int AS day, sum(d.delta) AS kwh,
               (SELECT min(s.day) FROM members_openhabcountersnapshot s
                JOIN members_openhabstatus os2 ON os2.id = s.status_id
                JOIN members_member m2 ON m2.id = os2.member_id
                WHERE m2.identifier = $1) AS first_day
        FROM deltas d
        JOIN members_openhabstatus os ON os.id = d.status_id
        JOIN members_member m ON m.id = os.member_id
        WHERE m.identifier = $1 AND d.day >= $2::date AND d.day < $3::date
        GROUP BY d.day
    `, [memberIdentifier, first(month), first(shiftMonth(month, 1))]);
    if (result.rows.length === 0) return null;

    const days = Array.from({ length: daysInMonth(month) }, (_, i) => ({ day: i + 1, kwh: 0 }));
    for (const r of result.rows) days[r.day - 1].kwh = Number(r.kwh);

    // pg liefert date als lokale Mitternacht, daher ueber lokale Felder lesen
    const firstDay = result.rows[0].first_day;
    const firstMonth = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}`;
    return {
        days,
        total: days.reduce((sum, d) => sum + d.kwh, 0),
        countedFromDay: firstMonth === month && firstDay.getDate() > 1 ? firstDay.getDate() : null,
    };
}

/** Batterie-Einspeisung aller Anlagen im Monat: { total, plants } (Anlagen mit Einspeisung). */
export async function getFleetBatteryMonth(db, month) {
    const result = await db.query(`
        ${BATTERY_DELTAS}
        SELECT coalesce(sum(per_plant.kwh), 0) AS total,
               count(*) FILTER (WHERE per_plant.kwh >= 1) AS plants
        FROM (SELECT status_id, sum(delta) AS kwh FROM deltas
              WHERE day >= $1::date AND day < $2::date GROUP BY status_id) per_plant
    `, [first(month), first(shiftMonth(month, 1))]);
    return { total: Number(result.rows[0].total), plants: Number(result.rows[0].plants) };
}

/**
 * Einspeisung des Mitglieds getrennt nach Dunkelheit und Tag, jeweils gesamt
 * und an die Gemeinschaft geliefert. Dunkel = Stunden ohne Globalstrahlung
 * laut weather_weatherdata; dort kann nur die Batterie einspeisen. null,
 * wenn die Wetterdaten den Monat nicht abdecken.
 */
export async function getMemberFeedInByDaylight(db, memberIdentifier, month) {
    const range = [first(month), first(shiftMonth(month, 1))];
    const result = await db.query(`
        select (w.shortwave_radiation = 0) as dark,
            sum(m.value) filter (where m.meter_code_id = ${METER.production}) as feed_in,
            sum(m.value) filter (where m.meter_code_id = ${METER.surplus}) as surplus,
            count(distinct w.time) as hours
        from metering_measurement m
        inner join members_measurementpoint p on p.id = m.measurement_point_id
        inner join members_member member on member.id = p.member_id
        inner join weather_weatherdata w on w.time = date_trunc('hour', m.timestamp)
        where member.identifier = $1
        and p.status = 'ACTIVE'
        and m.meter_code_id in (${METER.production}, ${METER.surplus})
        and m.timestamp >= ($2::date)::timestamp at time zone 'Europe/Vienna'
        and m.timestamp < ($3::date)::timestamp at time zone 'Europe/Vienna'
        and w.shortwave_radiation is not null
        group by 1
    `, [memberIdentifier, ...range]);

    const hours = result.rows.reduce((sum, r) => sum + Number(r.hours), 0);
    if (hours < daysInMonth(month) * 24 * 0.9) return null;

    const pick = (dark) => {
        const row = result.rows.find((r) => r.dark === dark);
        const feedIn = Number(row?.feed_in ?? 0);
        return { feedIn, community: Math.max(0, feedIn - Number(row?.surplus ?? 0)) };
    };
    return { dark: pick(true), daylight: pick(false) };
}
