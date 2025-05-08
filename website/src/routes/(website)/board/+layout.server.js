import { getBoardMemberByEmail } from '$lib/server/db/members/member';
import { error, fail, redirect } from "@sveltejs/kit"

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, parent }) {

    // member info
    let { boardMember } = await parent();

    if (!boardMember) {
        error(401, {message: "unauthorized"});
    }


    return {
        
    }

}
