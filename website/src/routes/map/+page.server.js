import { MAPBOX_TOKEN } from "$env/static/private";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {



    return {
        mapboxToken: MAPBOX_TOKEN,
    }

}