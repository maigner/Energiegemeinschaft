
import { cashierSession } from '$lib/server/db/members/authorization';
//import { nextcloudClient } from '$lib/server/nextcloud/client';


/** @type {import('./$types').LayoutServerLoad} */
export async function load({ params, parent }) {

    // member info
    let { session, member } = await parent();


    //kassiere only
    const authorized = await cashierSession(session);
    if (!authorized) {
        return {};
    }

    //const nc = nextcloudClient;
    //const folder = await nc.getFolder("/website")

    //console.log({folder});


    return {
        //member: member,
        bookingId: params.id
    }

}
