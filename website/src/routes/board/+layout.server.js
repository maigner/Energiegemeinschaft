import { getBoardMemberByEmail } from '$lib/server/db/members/member';
import { fail, redirect } from "@sveltejs/kit"

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {

    // member info
    let session = await locals.auth();

    // @ts-ignore
    const member = await getBoardMemberByEmail(session?.user?.email);

    return {
        member: member,
    }

}
