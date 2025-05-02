import { NEXTCLOUD_PASSWORD, NEXTCLOUD_URL, NEXTCLOUD_USERNAME } from "$env/static/private";

import { createClient } from "webdav";

const nextcloudClient = () => {
    return createClient(
        NEXTCLOUD_URL,
        {
            username: NEXTCLOUD_USERNAME,
            password: NEXTCLOUD_PASSWORD
        }
    )
};


const client = nextcloudClient();

