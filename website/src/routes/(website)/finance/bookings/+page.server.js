import { getLabels, getBookings, getBookingsLabels } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization';
import { nextcloudClient } from '$lib/server/nextcloud/client';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ url, parent }) {

    // member info
    let { session, member } = await parent();


    // TODO: kassiere only
    const authorized = await cashierSession(session);
    if (!authorized) {
        return {};
    }

    const nc = nextcloudClient;
    const folder = await nc.getFolder("/website")

    console.log({folder});


    return {
        //member: member,
        bookings: await getBookings(),
        filteredBookings: [],
        labels: await getLabels(),
        bookingsLabels: await getBookingsLabels()
    }

}
