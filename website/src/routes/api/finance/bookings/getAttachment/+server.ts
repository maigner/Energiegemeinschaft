import { cashierSession } from '$lib/server/db/members/authorization';
import { nextcloudClient } from '$lib/server/nextcloud/client';
import { getAttachment } from '$lib/server/db/finance/bookings.js';

/** @type {import('../../$types').RequestHandler} */
export async function GET(event) {

    const attachmentId = event.url.searchParams.get("attachmentId");


    const session = await event.locals.auth();

    const authorized = await cashierSession(session);
    if (!authorized) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }


    // @ts-ignore
    const attachment = await getAttachment(parseInt(attachmentId));
    if (!attachment) {
        return new Response(null, { status: 404, statusText: "No attachment" })
    }


    const nextcloud = nextcloudClient();


    const stat = await nextcloud.stat(attachment.filename);
    //console.log({ stat });

    if (!stat) {
        return new Response(null, { status: 404, statusText: "No Stats for File" })
    }


    const baseFileName = attachment.filename.split("/").slice(-1)[0];
    const outputFileName = `${attachmentId}-${baseFileName}`;

    try {
        // Bankbelege nicht auf Platte zwischenspeichern, direkt durchreichen
        const file = await nextcloud.getFileContents(attachment.filename, { format: "binary" });

        return new Response(file, {
            status: 200,
            headers: {
                'Content-Type': stat.mime, // Adjust MIME type for the file you're generating
                'Content-Disposition': `attachment; filename="${outputFileName}"` // Forces download with a filename
            }
        });

    } catch (e) {
        return new Response(null, { status: 500, statusText: "loading attachment failed" })
    }

}