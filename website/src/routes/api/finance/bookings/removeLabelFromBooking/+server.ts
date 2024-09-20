import { deleteBookingLabel } from '$lib/server/db/finance/bookings';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    const session = await event.locals.auth();

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    if (session?.user?.email !== "martin@maigner.net") {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    const { bookingId, labelId } = await event?.request?.json();
    const result = await deleteBookingLabel(bookingId, labelId);
    return json(
        result
    );

}