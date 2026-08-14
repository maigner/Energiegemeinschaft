import { insertOrUpdateBookingLabel } from '$lib/server/db/finance/bookings';
import { cashierGuard } from '$lib/server/db/members/authorization.js';
import { parseId } from '$lib/server/api';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    const guard = await cashierGuard(event.locals);
    if (guard) return guard;

    const body = await event.request.json();
    const bookingId = parseId(body.bookingId);
    const labelId = parseId(body.labelId);
    if (bookingId === null || labelId === null) {
        return new Response(null, { status: 400, statusText: "invalid bookingId/labelId" });
    }

    const result = await insertOrUpdateBookingLabel(bookingId, labelId);
    return json(result);

}
