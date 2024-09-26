import { getLabels, getBookings, getBookingsLabels, getBookingsAttachments, getAttachment } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs';
import { nextcloudClient } from '$lib/server/nextcloud/client';
import { fail } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ parent }) {

    // member info
    let { session } = await parent();


    // TODO: kassiere only
    const authorized = await cashierSession(session);
    if (!authorized) {
        return {};
    }




    return {
        //member: member,
        bookings: await getBookings(),
        filteredBookings: [],
        labels: await getLabels(),
        bookingsLabels: await getBookingsLabels(),
        bookingsAttachments: await getBookingsAttachments()
    }

}



/** @type {import('./$types').Actions} */
export const actions = {
    downloadFile: async ({ request }) => {
        // Step 1: Extract attachmentId from the request form data
        const formData = await request.formData();
        const attachmentId = formData.get('attachmentId');

        // Step 2: Define the path for the temporary file based on attachmentId
        // You can customize this logic based on attachmentId (e.g., different files for different IDs)
        const tempDir = tmpdir();

        // For the sake of this example, we'll just create a simple file based on attachmentId


        // @ts-ignore
        const attachment = await getAttachment(parseInt(attachmentId));
        if (!attachment) {
            return fail(404, { error: `No attachment` });
        }
        console.log({ attachment });


        const nextcloud = nextcloudClient;


        const stat = await nextcloud.stat(attachment.filename);
        console.log({ stat });

        if (!stat) {
            return fail(404, { error: `No Stats for File` });
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

            return new Response(file, { status: 200,
                headers: {
                    'Content-Type': stat.mime, // Adjust MIME type for the file you're generating
                    'Content-Disposition': `attachment; filename="${outputFileName}"` // Forces download with a filename
                }
            });

        } catch (e) {
            return fail(500, { error: `Cannot read from Nextcloud` });
        }


    }
};