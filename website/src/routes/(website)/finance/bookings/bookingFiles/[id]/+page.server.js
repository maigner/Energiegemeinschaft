
import { cashierSession } from '$lib/server/db/members/authorization';
import { nextcloudClient } from '$lib/server/nextcloud/client';

import { Readable } from 'stream';
import { fail } from '@sveltejs/kit';


/** @type {import('./$types').PageServerLoad} */
export async function load({ params, parent }) {

    // member info
    let { session, member } = await parent();


    //kassiere only
    const authorized = await cashierSession(session);
    if (!authorized) {
        return {};
    }

    const bookingId = parseInt(params.id);
    if (!bookingId) {
        console.error("No id");
        return {};
    }

    const dir = `/website/finance/bookings/booking/${bookingId}`;
    const nextcloud = nextcloudClient;


    try {
        await nextcloud.createDirectory(dir);
    } catch {
        // exists
    }

    const directoryContents = await nextcloud.getDirectoryContents(dir);

    return {
        //member: member,
        bookingId: bookingId,
        directoryContents: directoryContents
    }

}

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

/** @type {import('./$types').Actions} */
export const actions = {

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


        if (files.length === 0) {
            return fail(400, { error: 'No files uploaded' });
        }

        const dir = `/website/finance/bookings/booking/${bookingId}`;
        const nextcloud = nextcloudClient;


        for (const file of files) {
            const target = `${dir}/${file.name}`;

            // Convert the file to a buffer
            const buffer = Buffer.from(await file.arrayBuffer());

            const fileStream = createReadStreamFromBuffer(buffer);
            const writestream = nextcloud.createWriteStream(target);

            try {
                // Await the piping of the streams
                await pipe(fileStream, writestream);
                console.log(`File ${file.name} uploaded successfully.`);
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