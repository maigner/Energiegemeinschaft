import { getNumberOfMembersStats } from "$lib/server/db/members/member";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const numberOfMembersStats = await getNumberOfMembersStats();

    return {
        numberOfMembersStats: numberOfMembersStats,
    }

}