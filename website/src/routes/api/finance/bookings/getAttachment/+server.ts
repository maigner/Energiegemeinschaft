import { cashierGuard } from '$lib/server/db/members/authorization';
import { nextcloudClient } from '$lib/server/nextcloud/client';
import { getAttachment } from '$lib/server/db/finance/bookings.js';
import { parseId, sanitizeFilename } from '$lib/server/api';

/** @type {import('../../$types').RequestHandler} */
export async function GET(event) {

    const guard = await cashierGuard(event.locals);
    if (guard) return guard;

    const attachmentId = parseId(event.url.searchParams.get("attachmentId"));
    if (attachmentId === null) {
        return new Response(null, { status: 400, statusText: "invalid attachmentId" });
    }

    const attachment = await getAttachment(attachmentId);
    if (!attachment) {
        return new Response(null, { status: 404, statusText: "No attachment" })
    }

    const nextcloud = nextcloudClient();

    const stat = await nextcloud.stat(attachment.filename);
    if (!stat) {
        return new Response(null, { status: 404, statusText: "No Stats for File" })
    }

    const baseFileName = attachment.filename.split("/").slice(-1)[0];
    const outputFileName = sanitizeFilename(`${attachmentId}-${baseFileName}`);

    try {
        // Bankbelege nicht auf Platte zwischenspeichern, direkt durchreichen
        const file = await nextcloud.getFileContents(attachment.filename, { format: "binary" });

        return new Response(file, {
            status: 200,
            headers: {
                'Content-Type': stat.mime,
                'Content-Disposition': `attachment; filename="${outputFileName}"` // Forces download with a filename
            }
        });

    } catch (e) {
        return new Response(null, { status: 500, statusText: "loading attachment failed" })
    }

}
