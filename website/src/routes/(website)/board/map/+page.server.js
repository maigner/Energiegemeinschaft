import { getMemberLocations } from "$lib/server/db/members/member";


/** @type {import('./$types').PageServerLoad} */
export async function load() {

    const memberLocations = await getMemberLocations();

    return {
        memberLocations: memberLocations
    }

}
