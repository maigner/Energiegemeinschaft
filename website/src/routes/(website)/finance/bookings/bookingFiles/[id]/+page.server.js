
import { cashierSession } from '$lib/server/db/members/authorization';
import { getNextcloudClient } from '$lib/server/nextcloud/client';

import Client from "nextcloud-node-client";

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

    const client = new Client();
    const folder = await client.getFolder(`/website/finance/bookings/booking/${bookingId}`);

    console.log({folder});


    return {
        //member: member,
        bookingId: bookingId,
        nextcloudFolder: folder
    }

}
