import Pool from 'pg-pool';
import { AUTHJS_DB_PASSWORD, AUTHJS_DB_DATABASE, AUTHJS_DB_HOST, AUTHJS_DB_PORT, AUTHJS_DB_USER } from "$env/static/private";
import { readFileSync } from 'node:fs';


export const pool = new Pool({
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
});

export const connectToDB = async () => await pool.connect();
