import { getUsersByEmail } from '$lib/server/db/members/member';
import { fail, redirect } from "@sveltejs/kit"

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ parent, locals }) {

    // member info
    let { session, member } = await parent();

    // @ts-ignore
    const users = await getUsersByEmail(session?.user?.email);
    

    return {
        users: users,
        member: member
    }

}
