import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { env } from "$env/dynamic/private";
const { AUTHJS_DB_PASSWORD, AUTHJS_DB_DATABASE, AUTHJS_DB_HOST, AUTHJS_DB_PORT, AUTHJS_DB_USER } = env;
const { MIDDLEWARE_DB_PASSWORD, MIDDLEWARE_DB_DATABASE, MIDDLEWARE_DB_HOST, MIDDLEWARE_DB_PORT, MIDDLEWARE_DB_USER } = env;

/**
 * TLS zur Datenbank. s1 serviert fuer PostgreSQL das Let's-Encrypt-
 * Zertifikat von s1.ischlstrom.org (certs/s1-postgres-chain.pem zeigt die
 * Kette); es laesst sich mit den oeffentlichen Wurzeln pruefen, ohne
 * eigene CA-Datei, die bei jeder Verlaengerung veralten wuerde. Dafuer
 * DB_SSL_SERVERNAME=s1.ischlstrom.org setzen - noetig, weil der Host im
 * Container eine IP ist (172.17.0.1). DB_SSL_CA (Pfad) bleibt fuer einen
 * Server mit privater CA moeglich. Ohne beides bleibt die Verbindung
 * verschluesselt, aber ungeprueft (ein Angreifer am Weg koennte sich als
 * Server ausgeben) - deshalb die Warnung.
 */
function sslConfig() {
    if (env.DB_SSL_CA || env.DB_SSL_SERVERNAME) {
        return {
            rejectUnauthorized: true,
            ...(env.DB_SSL_CA ? { ca: readFileSync(env.DB_SSL_CA, 'utf8') } : {}),
            ...(env.DB_SSL_SERVERNAME ? { servername: env.DB_SSL_SERVERNAME } : {})
        };
    }
    console.warn('DB_SSL_SERVERNAME/DB_SSL_CA nicht gesetzt: Datenbank-TLS ohne Zertifikatspruefung (siehe docs/server-setup.md).');
    return { rejectUnauthorized: false };
}
const ssl = sslConfig();


export const authDbPool = new Pool({
    host: AUTHJS_DB_HOST,
    port: Number(AUTHJS_DB_PORT),
    database: AUTHJS_DB_DATABASE,
    user: AUTHJS_DB_USER,
    password: AUTHJS_DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl,
});

export const middlewareDbPool = new Pool({
    host: MIDDLEWARE_DB_HOST,
    port: Number(MIDDLEWARE_DB_PORT),
    database: MIDDLEWARE_DB_DATABASE,
    user: MIDDLEWARE_DB_USER,
    password: MIDDLEWARE_DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl,
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