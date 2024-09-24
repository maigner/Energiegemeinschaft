
import { cashierSession } from '$lib/server/db/members/authorization';
import { nextcloudClient } from '$lib/server/nextcloud/client';


/** @type {import('./$types').PageServerLoad} */
export async function load({ params, parent }) {

    // member info
    let { session, member } = await parent();


    //kassiere only
    const authorized = await cashierSession(session);
    if (!authorized) {
        return {};
    }

    const bookingId = parseInt(params.id);
    if (!bookingId) {
        console.error("No id");
        return {};
    }

    const nc = nextcloudClient;
    const folder = await nc.getFolder(`/website/finance/bookings/booking/${bookingId}`);

    console.log({folder});


    return {
        //member: member,
        bookingId: bookingId,
        nextcloudFolder: folder
    }

}
