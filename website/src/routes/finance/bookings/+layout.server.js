import { getLabels, getBookings, getBookingsLabels } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, parent }) {

    // member info
    let { session, member } = await parent();

    //console.log({ member });

    // TODO: kassiere only
    const authorized = await cashierSession(session);
    if (!authorized) {
        return {};
    }

    return {
        //member: member,
        bookings: await getBookings(new Date("2023-09-01"), new Date("2024-09-30")),
        labels: await getLabels(),
        bookingsLabels: await getBookingsLabels()
    }

}
