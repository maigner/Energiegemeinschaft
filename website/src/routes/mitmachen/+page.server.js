//import { getMembers } from '$lib/server/db/members/member';
//import { getUsers } from '$lib/server/db/authjs/user';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent }) {


    //const session = await event.locals.getSession();

    console.log("mitmachen page load");
    
    //const {session} = await parent();
    //console.log(session);

    // kennen wir den schon?

    return {
        //members: await getMembers(),
        //users: await getUsers()
    }


	
}