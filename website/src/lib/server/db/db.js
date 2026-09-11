import { Pool } from 'pg';
import { AUTHJS_DB_PASSWORD, AUTHJS_DB_DATABASE, AUTHJS_DB_HOST, AUTHJS_DB_PORT, AUTHJS_DB_USER } from "$env/static/private";
import { MIDDLEWARE_DB_PASSWORD, MIDDLEWARE_DB_DATABASE, MIDDLEWARE_DB_HOST, MIDDLEWARE_DB_PORT, MIDDLEWARE_DB_USER } from "$env/static/private";


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
    },
});


// Ohne Handler beendet ein 'error'-Event auf dem Pool den ganzen Node-Prozess.
// Das passiert z.B. wenn Postgres eine idle Verbindung schliesst
// ("terminating connection due to administrator command" bei einem
// Postgres-Neustart durch unattended-upgrades). Mit Handler wird der Client
// aus dem Pool entfernt und die naechste Query verbindet neu.
const logPoolError = (name) => (err) => {
    console.error(`pg pool ${name}: idle client error: ${err.message}`);
};
authDbPool.on('error', logPoolError('authjs'));
middlewareDbPool.on('error', logPoolError('middleware'));

const originalMiddlewareDbPoolQuery = middlewareDbPool.query.bind(middlewareDbPool);


export const authDbConnection = async () => await authDbPool.connect();
export const middlewareDbConnection = async () => await middlewareDbPool.connect();