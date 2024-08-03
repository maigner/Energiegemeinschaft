import { SvelteKitAuth } from "@auth/sveltekit"
import Nodemailer from "@auth/sveltekit/providers/nodemailer"
import { SMTP_USER, SMTP_PWD, SMTP_ENDPOINT, SMTP_TLS_PORT, AUTH_SECRET, AUTH_EMAIL_FROM } from "$env/static/private";
import PostgresAdapter from "@auth/pg-adapter";
import { redirect } from '@sveltejs/kit';
import { authDbPool } from "$lib/server/db/db";


export async function authorizationHandle({ event, resolve }) {

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


    if (event.url.pathname.startsWith('/board')) {
        //console.log("Requires authentication");
        const session = await event.locals.getSession();

        if (!session) {
            throw redirect(307, `/login?source=${event.url.pathname}`);
        }
    }


    return resolve(event);
}

const providers = [
    Nodemailer({
        server: {
            host: SMTP_ENDPOINT,
            port: SMTP_TLS_PORT,
            secure: true,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PWD
            }
        },
        from: AUTH_EMAIL_FROM
    }),
];


// request -> authjs -> authorize -> page
export const { handle, signIn, signOut } = SvelteKitAuth({
    trustHost: true,
    secret: AUTH_SECRET,
    adapter: PostgresAdapter(authDbPool),
    pages: {
        signIn: '/login',
        //signOut: '/login',
        verifyRequest: '/verify'
    },
    providers
});
