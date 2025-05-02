import { nextcloudClient } from '$lib/server/nextcloud/client';


/** @type {import('../$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const dir = "/website/board/energy/import";

    const nextcloud = nextcloudClient();
    const directoryItems = await nextcloud.getDirectoryContents(dir);




    return {
        directoryItems: directoryItems
    }

}