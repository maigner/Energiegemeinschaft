import { getBoardMemberByEmail } from '$lib/server/db/members/member';
import { fail, redirect } from "@sveltejs/kit"

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, parent }) {

    // member info
    let { session, member } = await parent();


    return {
        member: member,
    }

}
