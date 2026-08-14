import { cashierGuard } from '$lib/server/db/members/authorization.js';
import { nextcloudClient } from '$lib/server/nextcloud/client.js';
import { parseId } from '$lib/server/api';
import { json } from '@sveltejs/kit';

import { Readable } from 'stream';
import { addFileToBooking } from '$lib/server/db/finance/bookings';

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

    const guard = await cashierGuard(event.locals);
    if (guard) return guard;

    const formData = await event.request.formData();

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
        return new Response(null, { status: 400, statusText: "file" })
    }

    const bookingId = parseId(formData.get("bookingId"));
    if (bookingId === null) {
        return new Response(null, { status: 400, statusText: "bookingId" })
    }

    // strip any path components from the client-supplied name
    const fileName = file.name.split("/").pop()?.split("\\").pop();
    if (!fileName || fileName === "." || fileName === "..") {
        return new Response(null, { status: 400, statusText: "invalid filename" })
    }

    const dir = `/website/finance/bookings/booking/${bookingId}`;
    const nextcloud = nextcloudClient();

    try {
        if (!(await nextcloud.exists(dir))) {
            await nextcloud.createDirectory(dir);
            console.log("created " + dir);
        }
    } catch (e) {
        console.error(e);
        return new Response(null, { status: 500, statusText: "createDirectory" });
    }

    const target = `${dir}/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const fileStream = createReadStreamFromBuffer(buffer);
    const writestream = nextcloud.createWriteStream(target);

    let attachment;

    try {
        await pipe(fileStream, writestream);

        // update DB
        attachment = await addFileToBooking(bookingId, target);

    } catch (err) {
        console.error(`Error writing file ${fileName}:`, err);
        return new Response(null, { status: 500, statusText: "upload failed" });
    }

    return json({ success: true, message: 'File uploaded', attachment: attachment });

}
