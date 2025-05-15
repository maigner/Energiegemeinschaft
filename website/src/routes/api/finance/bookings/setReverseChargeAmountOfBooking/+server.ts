import { updateBookingReverseChargeAmount } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization.js';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    //console.log({event});

    const session = await event.locals.auth();

    //console.log({session});

    const authorized = await cashierSession(session);
    if (!authorized) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    const { bookingId, reverseChargeAmount } = await event?.request?.json();

    const result = await updateBookingReverseChargeAmount(bookingId, reverseChargeAmount);
    return json(
        result
    );

}