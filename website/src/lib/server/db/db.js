import Pool from 'pg-pool';
import { AUTHJS_DB_PASSWORD, AUTHJS_DB_DATABASE, AUTHJS_DB_HOST, AUTHJS_DB_PORT, AUTHJS_DB_USER } from "$env/static/private";
import { MIDDLEWARE_DB_PASSWORD, MIDDLEWARE_DB_DATABASE, MIDDLEWARE_DB_HOST, MIDDLEWARE_DB_PORT, MIDDLEWARE_DB_USER } from "$env/static/private";
import { readFileSync } from 'node:fs';


export const authDbPool = new Pool({
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

export const middlewareDbPool = new Pool({
    host: MIDDLEWARE_DB_HOST,
    port: MIDDLEWARE_DB_PORT,
    database: MIDDLEWARE_DB_DATABASE,
    user: MIDDLEWARE_DB_USER,
    password: MIDDLEWARE_DB_PASSWORD,
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

export const authDbConnection = async () => await authDbPool.connect();
export const middlewareDbConnection = async () => await middlewareDbPool.connect();