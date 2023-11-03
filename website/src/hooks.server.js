import { SvelteKitAuth } from '@auth/sveltekit';
import GoogleProvider from '@auth/core/providers/google';
import EmailProvider from '@auth/core/providers/email';
import { SMTP_USER, SMTP_PASSWORD, SMTP_ENDPOINT, SMTP_TLS_PORT } from "$env/static/private";


import {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
} from '$env/static/private';

export const handle = SvelteKitAuth({
    providers: [
        /*
        EmailProvider({
            server: {
                host: SMTP_ENDPOINT,
                port: Number(SMTP_TLS_PORT),
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PASSWORD
                }
            },
            from: "martin@maigner.net"
        }),
        */
        GoogleProvider({ clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET })
    ]
});