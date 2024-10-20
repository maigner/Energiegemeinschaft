import { getUsersByEmail } from '$lib/server/db/members/member';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ parent, locals }) {

    // member info
    let { session } = await parent();

    // @ts-ignore
    const users = await getUsersByEmail(session?.user?.email);

    //console.log({users});
    

    return {
        users: users
    }

}
