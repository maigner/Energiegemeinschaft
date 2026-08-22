import { error } from '@sveltejs/kit';
import { getOpenhabStatus, getOpenhabStatusHistory, getOpenhabStatuses } from '$lib/server/db/members/openhabStatus';
import { newestVersion } from '$lib/versions';

const HISTORY_DAYS = 14;

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {

    const statusId = Number(params.id);
    if (!Number.isInteger(statusId) || statusId <= 0) {
        error(404, { message: 'Anlage nicht gefunden' });
    }

    const status = await getOpenhabStatus(statusId);
    if (!status) {
        error(404, { message: 'Anlage nicht gefunden' });
    }

    const history = await getOpenhabStatusHistory(statusId, HISTORY_DAYS);

    // Neuester Versionsstand je Komponente ueber alle Anlagen - die Seite
    // hebt damit hervor, wo diese Anlage hinterherhinkt. Das OS bleibt
    // aussen vor: unterschiedliche Distributionen sind kein Rueckstand.
    const all = await getOpenhabStatuses();
    /** @type {Record<string, string | null>} */
    const fleetNewest = {};
    for (const key of ['ibm', 'openhab', 'java']) {
        fleetNewest[key] = newestVersion(
            all.map((/** @type {any} */ row) => row.data?.versions?.[key])
        );
    }

    const mappedHistory = history.map((/** @type {any} */ row) => ({
        time: row.bucket.toISOString(),
        soc: row.soc === null ? null : Number(row.soc),
        batteryPowerW: row.battery_power_w === null ? null : Number(row.battery_power_w),
        // Einspeisung aus der Batterie bzw. Netto-Ladung aus dem Netz: je
        // Messpunkt in SQL abgeleitet (min aus Batterie- und Netzleistung),
        // dann auf 15 Minuten gemittelt.
        batteryToGridW: row.battery_to_grid_w === null ? null : Number(row.battery_to_grid_w),
        gridToBatteryW: row.grid_to_battery_w === null ? null : Number(row.grid_to_battery_w),
        cpuTempC: row.cpu_temp_c === null ? null : Number(row.cpu_temp_c),
        diskUsedPct: row.disk_used_pct === null ? null : Number(row.disk_used_pct),
        memUsedPct: row.mem_used_pct === null ? null : Number(row.mem_used_pct),
        swapUsedPct: row.swap_used_pct === null ? null : Number(row.swap_used_pct)
    }));

    // Energiesumme Batterie -> Netz im angezeigten Zeitraum: jedes
    // 15-Minuten-Fenster traegt mittlere Leistung mal Viertelstunde bei.
    const batteryToGridKwh = mappedHistory.reduce(
        (/** @type {number} */ sum, /** @type {{ batteryToGridW: number | null }} */ row) =>
            sum + (row.batteryToGridW ?? 0) * 0.25 / 1000,
        0
    );

    return {
        fleetNewest,
        anlage: {
            id: status.id,
            name: status.name,
            memberName: status.member_name,
            memberIdentifier: status.member_identifier,
            lastSeen: status.last_seen,
            ageSeconds: status.age_seconds === null ? null : Number(status.age_seconds),
            data: status.data ?? {}
        },
        historyDays: HISTORY_DAYS,
        batteryToGridKwh,
        history: mappedHistory
    };
}
