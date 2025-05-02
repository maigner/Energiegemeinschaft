import { NEXTCLOUD_PASSWORD, NEXTCLOUD_URL, NEXTCLOUD_USERNAME } from "$env/static/private";

import { createClient } from "webdav";

export const nextcloudClient = () => {
    return createClient(
        NEXTCLOUD_URL,
        {
            username: NEXTCLOUD_USERNAME,
            password: NEXTCLOUD_PASSWORD
        }
    )
};
