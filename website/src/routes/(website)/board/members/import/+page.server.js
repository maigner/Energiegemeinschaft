import { getMeasurementPoints, getMembers, getNumberOfMembersStats } from "$lib/server/db/members/member";
import { nextcloudClient } from "$lib/server/nextcloud/client";
import { importMemberDataFromNextcloud } from "$lib/server/nextcloud/members/memberdata";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const messages = await importMemberDataFromNextcloud();

    return {
        messages: messages
    }

}