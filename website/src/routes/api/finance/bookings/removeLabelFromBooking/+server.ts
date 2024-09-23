import { deleteBookingLabel } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    const session = await event.locals.auth();

    const authorized = await cashierSession(session);
    if (!authorized) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    const { bookingId, labelId } = await event?.request?.json();
    const result = await deleteBookingLabel(bookingId, labelId);
    return json(
        result
    );

}