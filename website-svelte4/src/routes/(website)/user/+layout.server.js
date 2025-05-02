import { dev } from '$app/environment';
import { getUsersByEmail } from '$lib/server/db/members/member';
import { relay, relayDebug, relayDebut } from '$lib/server/mail/smtp';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ parent, locals }) {

    // member info
    let { session } = await parent();

    // @ts-ignore
    const users = await getUsersByEmail(session?.user?.email);

    if (!users && !dev) {
        // new email registered
        relayDebug("new email registered", session?.user);
    }

    //console.log({users});
    

    return {
        users: users
    }

}
