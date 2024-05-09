import { MAPBOX_TOKEN } from "$env/static/private";
import { getMemberLocations } from "$lib/server/db/members/member";
import { readFileSync } from 'node:fs';


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const jsonFile = readFileSync('member_locations.json').toString();

    //const memberLocations = JSON.parse(jsonFile);

    const memberLocations = await getMemberLocations();




    return {
        mapboxToken: MAPBOX_TOKEN,
        memberLocations: memberLocations
    }

}