import { MAPBOX_TOKEN } from "$env/static/private";
import { getMemberLocations } from "$lib/server/db/members/member";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const memberLocations = await getMemberLocations();

    return {
        mapboxToken: MAPBOX_TOKEN,
        memberLocations: memberLocations
    }

}