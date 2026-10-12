import { env } from "$env/dynamic/private";
const { NEXTCLOUD_PASSWORD, NEXTCLOUD_URL, NEXTCLOUD_USERNAME } = env;

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

