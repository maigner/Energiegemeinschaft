import { error } from '@sveltejs/kit';
import { getOpenhabStatus, getOpenhabStatusHistory } from '$lib/server/db/members/openhabStatus';

const HISTORY_DAYS = 7;

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

    return {
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
        history: history.map((/** @type {any} */ row) => {
            const battery = row.battery_power_w === null ? null : Number(row.battery_power_w);
            const grid = row.grid_power_w === null ? null : Number(row.grid_power_w);
            return {
                time: row.bucket.toISOString(),
                soc: row.soc === null ? null : Number(row.soc),
                batteryPowerW: battery,
                // Einspeisung aus der Batterie: Batterie liefert (+) und das
                // Netz nimmt auf (Netzleistung negativ); der kleinere der
                // beiden Werte fliesst tatsaechlich von der Batterie ins Netz.
                batteryToGridW:
                    battery === null || grid === null
                        ? null
                        : Math.min(Math.max(battery, 0), Math.max(-grid, 0))
            };
        })
    };
}
