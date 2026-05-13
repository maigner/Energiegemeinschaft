import { updateMissingMemberCoordinates } from "$lib/server/db/members/coordinates";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const messages = await updateMissingMemberCoordinates();

    return {
        messages: messages
    }

}