

import { SvelteKitAuth } from '@auth/sveltekit';
import GoogleProvider from '@auth/core/providers/google';
import EmailProvider from '@auth/core/providers/email';
import { SMTP_USER, SMTP_PASSWORD, SMTP_ENDPOINT, SMTP_TLS_PORT, AUTH_SECRET } from "$env/static/private";
import { AUTHJS_DB_PASSWORD, AUTHJS_DB_DATABASE, AUTHJS_DB_HOST, AUTHJS_DB_PORT, AUTHJS_DB_USER } from "$env/static/private";

import PostgresAdapter from "@auth/pg-adapter"
import Pool from 'pg-pool'


import {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
} from '$env/static/private';


console.log(AUTH_SECRET);

const pool = new Pool({
    host: AUTHJS_DB_HOST,
    port: AUTHJS_DB_PORT,
    database: AUTHJS_DB_DATABASE, 
    user: AUTHJS_DB_USER,
    password: AUTHJS_DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
})

export const handle = SvelteKitAuth({
    trustHost: true,
    secret: AUTH_SECRET,
    adapter: PostgresAdapter(pool),
    providers: [
        
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
        
        GoogleProvider({ clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET })
    ]
});

