import { getLabels, getBookings, getBookingsLabels, getBookingsAttachments, getAttachment, addFileToBooking } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs';
import { nextcloudClient } from '$lib/server/nextcloud/client';
import { fail } from '@sveltejs/kit';
import { Readable } from 'stream';

const pipe = (source, destination) => {
    return new Promise((resolve, reject) => {
        source.pipe(destination);
        destination.on('finish', resolve);
        destination.on('error', reject);
    });
};

const createReadStreamFromBuffer = (buffer) => {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // Signal that we're done
    return stream;
};

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

            return new Response(file, {
                status: 200,
                headers: {
                    'Content-Type': stat.mime, // Adjust MIME type for the file you're generating
                    'Content-Disposition': `attachment; filename="${outputFileName}"` // Forces download with a filename
                }
            });

        } catch (e) {
            return fail(500, { error: `Cannot read from Nextcloud` });
        }


    },
    delete: async ({ request }) => {
        const formData = await request.formData();
        const filename = formData.get("filename");
        const bookingId = formData.get("bookingId");
        const dir = `/website/finance/bookings/booking/${bookingId}`;

        if (!filename.startsWith(dir)) {
            return fail(500, { error: `Illegal path` });
        }


        console.log({ filename });

        const nextcloud = nextcloudClient;

        try {
            await nextcloud.deleteFile(filename);
            await deleteFileFromBooking(bookingId, filename);
        } catch (err) {
            console.error(`Error deleting file ${filename}:`, err);
            return fail(500, { error: `Failed to delete ${filename}` });
        }

        return {
            success: true
        };
    },

    upload: async ({ request }) => {

        const formData = await request.formData();
        const files = formData.getAll('files');
        const bookingId = formData.get("bookingId");

        console.log({bookingId});

        if (files.length === 0) {
            return fail(400, { error: 'No files uploaded' });
        }

        const dir = `/website/finance/bookings/booking/${bookingId}`;
        const nextcloud = nextcloudClient;


        for (const file of files) {
            const target = `${dir}/${file.name}`;

            // Convert the file to a buffer
            // @ts-ignore
            const buffer = Buffer.from(await file.arrayBuffer());

            const fileStream = createReadStreamFromBuffer(buffer);
            const writestream = nextcloud.createWriteStream(target);

            try {
                // Await the piping of the streams
                await pipe(fileStream, writestream);
                console.log(`File ${file.name} uploaded successfully.`);


                // update DB
                await addFileToBooking(bookingId, target);


            } catch (err) {
                console.error(`Error writing file ${file.name}:`, err);
                return fail(500, { error: `Failed to upload ${file.name}` });
            }

        };

        return {
            success: true
        };


    }
};