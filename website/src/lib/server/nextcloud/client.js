import Client from "nextcloud-node-client";

let client = new Client();

export const getNextcloudClient = () => {
    if (!client) {
        client = new Client();
    }
    return client;
};