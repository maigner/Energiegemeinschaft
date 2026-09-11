import { getMemberLocations } from "$lib/server/db/members/member";
import {
    getStationEnergyBalance,
    getStationPointCounts,
} from "$lib/server/db/energy/stations";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    const [memberLocations, stationBalance, stationPoints] = await Promise.all([
        getMemberLocations(),
        // letzte 12 Monate vor dem letzten Datentag; null = View fehlt
        getStationEnergyBalance(365),
        getStationPointCounts(),
    ]);

    return {
        memberLocations,
        stationBalance,
        stationPoints,
    };
}
