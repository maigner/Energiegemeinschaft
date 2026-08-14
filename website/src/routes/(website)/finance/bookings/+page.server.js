import { getLabels, getBookings, getBookingsLabels, getBookingsAttachments } from '$lib/server/db/finance/bookings';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ parent }) {

    // member info
    let { isCashierSession } = await parent();

    if (!isCashierSession) {
        error(403, { message: 'Nicht berechtigt' });
    }

    const [bookings, labels, bookingsLabels, bookingsAttachments] = await Promise.all([
        getBookings(),
        getLabels(),
        getBookingsLabels(),
        getBookingsAttachments()
    ]);

    return {
        bookings,
        labels,
        bookingsLabels,
        bookingsAttachments
    }

}
