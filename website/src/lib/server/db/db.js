import Pool from 'pg-pool';
import { AUTHJS_DB_PASSWORD, AUTHJS_DB_DATABASE, AUTHJS_DB_HOST, AUTHJS_DB_PORT, AUTHJS_DB_USER } from "$env/static/private";
import { MIDDLEWARE_DB_PASSWORD, MIDDLEWARE_DB_DATABASE, MIDDLEWARE_DB_HOST, MIDDLEWARE_DB_PORT, MIDDLEWARE_DB_USER } from "$env/static/private";
import { getOpenhabDbConfigForMember } from './members/openhab';


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



const originalMiddlewareDbPoolQuery = middlewareDbPool.query.bind(middlewareDbPool);


export const authDbConnection = async () => await authDbPool.connect();
export const middlewareDbConnection = async () => await middlewareDbPool.connect();


// map of memberId to openhab db connection pool
const openhabDbPools = {};

// here are the definitions of the connections to the openhab persistende databases
export const openhabDbConnection = async (memberIdentifier) => {

    if (!openhabDbPools[memberIdentifier]) {
        // create a new connection pool for this memberId

        const { host, port, database, user, password } = await getOpenhabDbConfigForMember(memberIdentifier);

        //console.log({ host, port, database, user, password });

        openhabDbPools[memberIdentifier] = new Pool({
            host: host,
            port: port,
            database: database,
            user: user,
            password: password,
            max: 2,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            ssl: {
                rejectUnauthorized: false
            },
            options: `-c timezone=Europe/Vienna`
        });
    }

    return await openhabDbPools[memberIdentifier].connect();

}