import { NEXTCLOUD_PASSWORD, NEXTCLOUD_URL, NEXTCLOUD_USERNAME } from "$env/static/private";
import Client, { Server } from "nextcloud-node-client";
const server = new Server(
    {
        basicAuth:
        {
            password: NEXTCLOUD_PASSWORD,
            username: NEXTCLOUD_USERNAME,
        },
        url: NEXTCLOUD_URL,
    });

export const nextcloudClient = new Client(server);