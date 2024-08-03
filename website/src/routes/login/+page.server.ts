

/** @type {import('../[callbackUrl]/$types').PageServerLoad} */
export async function load({ fetch, params, parent, route, url }) {

    
    return {
        // source is the site that triggered login via auth.ts
        source: url?.searchParams?.get("source")
    }

}