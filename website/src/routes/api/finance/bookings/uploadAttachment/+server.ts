import { insertOrUpdateBookingLabel } from '$lib/server/db/finance/bookings';
import { cashierSession } from '$lib/server/db/members/authorization.js';
import { nextcloudClient } from '$lib/server/nextcloud/client.js';
import { json } from '@sveltejs/kit';

import { Readable } from 'stream';
import { fail } from '@sveltejs/kit';
import { addFileToBooking, deleteFileFromBooking } from '$lib/server/db/finance/bookings';

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


/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {
    //console.log({event});
    const session = await event.locals.auth();
    //console.log({ session });
    const authorized = await cashierSession(session);
    if (!authorized) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }


    const formData = await event.request.formData(); // Get the form data

    // Retrieve the file from the form data
    const file = formData.get('file');
    //console.log(file);
    if (!file) {
        return new Response(null, { status: 500, statusText: "file" })
    }

    const bookingId = parseInt(formData.get("bookingId"));
    if (!bookingId) {
        return new Response(null, { status: 500, statusText: "bookingId" })
    }
    //console.log({ bookingId });

    const dir = `/website/finance/bookings/booking/${bookingId}`;
    const nextcloud = nextcloudClient();


    try {
        await nextcloud.createDirectory(dir);
        console.log("created " + dir);
    } catch (e) {
        console.error(e);
    }


    const target = `${dir}/${file.name}`;

    // Convert the file to a buffer
    // @ts-ignore
    const buffer = Buffer.from(await file.arrayBuffer());

    const fileStream = createReadStreamFromBuffer(buffer);
    const writestream = nextcloud.createWriteStream(target);

    let attachment;

    try {
        // Await the piping of the streams
        await pipe(fileStream, writestream);
        //console.log(`File ${file.name} uploaded successfully.`);


        // update DB
        attachment = await addFileToBooking(bookingId, target);


    } catch (err) {
        console.error(`Error writing file ${file.name}:`, err);
        return new Response(null, { status: 500, statusText: "upload failed" })
    }


    // Send a response back
    return json({ success: true, message: 'File uploaded', attachment: attachment });

}