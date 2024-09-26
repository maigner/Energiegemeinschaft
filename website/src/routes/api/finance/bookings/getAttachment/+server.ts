import { cashierSession } from '$lib/server/db/members/authorization';
import { nextcloudClient } from '$lib/server/nextcloud/client';
import { fail, json } from '@sveltejs/kit';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs';
import { getAttachment } from '$lib/server/db/finance/bookings.js';

/** @type {import('../../$types').RequestHandler} */
export async function GET(event) {

    console.log({ event });


    const attachmentId = event.url.searchParams.get("attachmentId");


    const session = await event.locals.auth();

    const authorized = await cashierSession(session);
    if (!authorized) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }


    // Step 2: Define the path for the temporary file based on attachmentId
    // You can customize this logic based on attachmentId (e.g., different files for different IDs)
    const tempDir = tmpdir();

    // For the sake of this example, we'll just create a simple file based on attachmentId


    // @ts-ignore
    const attachment = await getAttachment(parseInt(attachmentId));
    if (!attachment) {
        return new Response(null, { status: 404, statusText: "No attachment" })
    }
    console.log({ attachment });


    const nextcloud = nextcloudClient;


    const stat = await nextcloud.stat(attachment.filename);
    console.log({ stat });

    if (!stat) {
        return new Response(null, { status: 404, statusText: "No Stats for File" })
    }


    const baseFileName = attachment.filename.split("/").slice(-1)[0];
    const outputFileName = `${attachmentId}-${baseFileName}`;
    const tempFilePath = path.join(tempDir, outputFileName);

    const writeStream = fs.createWriteStream(tempFilePath);



    try {
        nextcloud.createReadStream(attachment.filename).pipe(writeStream);

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        const file = fs.readFileSync(tempFilePath);

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