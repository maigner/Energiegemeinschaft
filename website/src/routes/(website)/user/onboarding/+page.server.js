import { getUsersByEmail } from '$lib/server/db/members/member';

/** @type {import('./$types').PageServerLoad} */
export async function load({ parent, locals }) {

    // member info
    let { session } = await parent();


}