// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { SvelteKitAuth } from '@auth/sveltekit';
import EmailProvider from '@auth/core/providers/email';
import { SMTP_USER, SMTP_PWD, SMTP_ENDPOINT, SMTP_TLS_PORT, AUTH_SECRET } from "$env/static/private";
import { AUTHJS_DB_PASSWORD, AUTHJS_DB_DATABASE, AUTHJS_DB_HOST, AUTHJS_DB_PORT, AUTHJS_DB_USER } from "$env/static/private";
import PostgresAdapter from "@auth/pg-adapter";
import Pool from 'pg-pool';
import { readFileSync } from 'node:fs';



// https://medium.com/@uriser/authentication-in-sveltekit-with-auth-js-7ff505d584c4
// Auth.js

import { connectToDB } from "$lib/db";


const pool = new Pool({
    host: AUTHJS_DB_HOST,
    port: AUTHJS_DB_PORT,
    database: AUTHJS_DB_DATABASE,
    user: AUTHJS_DB_USER,
    password: AUTHJS_DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
        rejectUnauthorized: false,
        ca: readFileSync('global-bundle.pem').toString(),
        //key: readFileSync('global-bundle.pem').toString(),
        cert: readFileSync('global-bundle.pem').toString(),
    },
})

async function authorization({ event, resolve }) {

    console.log(`authorization pathname: ${event.url.pathname}`);

    if (event.url.pathname.startsWith('/mitmachen')) {
        const session = await event.locals.getSession();

        console.log(`authorization: ${session}`);

        if (!session) {
            throw redirect(307, '/login/mitmachen');
        }
    }
    return resolve(event);
}

async function database({ event, resolve }) {

    const sql = await connectToDB();
    event.locals = { sql };

    const response = await resolve(event);
    sql.release();

    return response;
}

export const handle = sequence(database, SvelteKitAuth({
    trustHost: true,
    secret: AUTH_SECRET,
    adapter: PostgresAdapter(pool),
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

