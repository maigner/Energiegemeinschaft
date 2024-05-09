import { MAPBOX_TOKEN } from "$env/static/private";
import { readFileSync } from 'node:fs';


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const jsonFile = readFileSync('member_locations.json').toString();

    const memberLocations = JSON.parse(jsonFile);


    

    return {
        mapboxToken: MAPBOX_TOKEN,
        memberLocations: memberLocations
    }

}