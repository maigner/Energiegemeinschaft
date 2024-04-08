import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { SvelteKitAuth } from '@auth/sveltekit';
import EmailProvider from '@auth/core/providers/email';
import { SMTP_USER, SMTP_PWD, SMTP_ENDPOINT, SMTP_TLS_PORT, AUTH_SECRET } from "$env/static/private";
import PostgresAdapter from "@auth/pg-adapter";


// https://medium.com/@uriser/authentication-in-sveltekit-with-auth-js-7ff505d584c4
// Auth.js

import { authDbPool } from "$lib/server/db/db";


async function authorization({ event, resolve }) {

    // console.log("authorization");
    // console.log(event.route);

    /*
    if (event.url.pathname.startsWith('/mitmachen')) {
        const session = await event.locals.getSession();

        if (!session) {
            throw redirect(307, '/login/mitmachen');
        }
    }
    

    if (event.url.pathname.startsWith('/chatbot')) {
        console.log("Requires authentication");
        const session = await event.locals.getSession();

        if (!session) {
            throw redirect(307, '/login/chatbot');
        }
    }
    */

    if (event.url.pathname.startsWith('/board/approve')) {
        console.log("Requires authentication");

        const session = await event.locals.getSession();

        if (!session) {
            throw redirect(307, '/login/board-approve');
        }
    }
    
   
    return resolve(event);
}


// request -> authjs -> authorize -> page
export const handle = sequence(SvelteKitAuth({
    trustHost: true,
    secret: AUTH_SECRET,
    adapter: PostgresAdapter(authDbPool),
    pages: {
        signIn: '/login',
        signOut: '/login',
        verifyRequest: '/verify'
    },
    providers: [

        EmailProvider({
            server: {
                host: SMTP_ENDPOINT,
                port: SMTP_TLS_PORT,
                secure: true,
                auth: {
                    user: SMTP_USER,
                    pass: SMTP_PWD
                }
            },
            from: "info@ischlstrom.org"
        }),
    ]
}), authorization);

