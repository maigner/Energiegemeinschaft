import { getUsersByEmail } from '$lib/server/db/members/member';
import { fail, redirect } from "@sveltejs/kit"

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {

    // member info
    let session = await locals.auth();

    // @ts-ignore
    //const users = await getUsersByEmail(session?.user?.email);
    const users = await getUsersByEmail("th.sams@schiffersams.at");
    

    return {
        users: users,
    }

}
