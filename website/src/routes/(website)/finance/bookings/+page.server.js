import { getLabels, getBookings, getBookingsLabels, getBookingsAttachments } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization';

/** @type {import('./$types').PageServerLoad} */
export async function load({ parent }) {

    // member info
    let { session } = await parent();


    // TODO: kassiere only
    const authorized = await cashierSession(session);
    if (!authorized) {
        return {};
    }

    


    return {
        //member: member,
        bookings: await getBookings(),
        filteredBookings: [],
        labels: await getLabels(),
        bookingsLabels: await getBookingsLabels(),
        bookingsAttachments: await getBookingsAttachments()
    }

}
