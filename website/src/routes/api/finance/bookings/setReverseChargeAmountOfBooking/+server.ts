import { updateBookingReverseChargeAmount } from '$lib/server/db/finance/bookings';
import { cashierGuard } from '$lib/server/db/members/authorization.js';
import { parseId } from '$lib/server/api';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    const guard = await cashierGuard(event.locals);
    if (guard) return guard;

    const body = await event.request.json();

    const bookingId = parseId(body.bookingId);
    if (bookingId === null) {
        return new Response(null, { status: 400, statusText: "invalid bookingId" });
    }

    // empty input clears the amount
    let reverseChargeAmount = body.reverseChargeAmount;
    if (reverseChargeAmount === undefined || reverseChargeAmount === "") {
        reverseChargeAmount = null;
    }
    if (reverseChargeAmount !== null) {
        reverseChargeAmount = Number(reverseChargeAmount);
        if (!Number.isFinite(reverseChargeAmount)) {
            return new Response(null, { status: 400, statusText: "invalid reverseChargeAmount" });
        }
    }

    await updateBookingReverseChargeAmount(bookingId, reverseChargeAmount);
    return json({ success: true });

}
