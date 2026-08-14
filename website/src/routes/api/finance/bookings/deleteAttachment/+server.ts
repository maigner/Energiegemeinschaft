import { cashierGuard } from '$lib/server/db/members/authorization';
import { nextcloudClient } from '$lib/server/nextcloud/client';
import { getAttachment, deleteFileFromBooking } from '$lib/server/db/finance/bookings';
import { parseId } from '$lib/server/api';
import { json } from '@sveltejs/kit';

/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    const guard = await cashierGuard(event.locals);
    if (guard) return guard;

    const body = await event.request.json();
    const attachmentId = parseId(body.attachmentId);
    if (attachmentId === null) {
        return new Response(null, { status: 400, statusText: "invalid attachmentId" });
    }

    const attachment = await getAttachment(attachmentId);
    if (!attachment) {
        return new Response(null, { status: 404, statusText: "No attachment" });
    }

    const nextcloud = nextcloudClient();

    try {
        // tolerate a file that is already gone in Nextcloud; the DB record
        // is removed either way
        if (await nextcloud.exists(attachment.filename)) {
            await nextcloud.deleteFile(attachment.filename);
        }
        await deleteFileFromBooking(attachment.booking_id, attachment.filename);
    } catch (err) {
        console.error(`Error deleting attachment ${attachment.filename}:`, err);
        return new Response(null, { status: 500, statusText: "delete failed" });
    }

    return json({ success: true });

}
