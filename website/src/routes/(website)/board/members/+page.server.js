import { getMeasurementPoints, getMembers, getNumberOfMembersStats } from "$lib/server/db/members/member";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const numberOfMembersStats = await getNumberOfMembersStats();
    const measurementPoints = await getMeasurementPoints();
    const members = await getMembers();


    return {
        numberOfMembersStats: numberOfMembersStats,
        measurementPoints: measurementPoints,
        members: members
    }

}