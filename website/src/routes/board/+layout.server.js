import { getBoardMemberByEmail } from '$lib/server/db/members/member';


/** @type {import('./$types').LayoutServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    // member info
    let session = await locals.getSession();
    // @ts-ignore
    const member = await getBoardMemberByEmail(session?.user?.email);

    return {
        member: member,
    }

}
