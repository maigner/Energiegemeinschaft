import { getMembers, getNumberOfMembersStats } from "$lib/server/db/members/member";
import { importMemberDataFromNextcloud } from "$lib/server/nextcloud/members/memberdata";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const numberOfMembersStats = await getNumberOfMembersStats();
    const members = await getMembers();

    await importMemberDataFromNextcloud();

    return {
        numberOfMembersStats: numberOfMembersStats,
        members: members
    }

}