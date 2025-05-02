

/** @type {import('../[callbackUrl]/$types').PageServerLoad} */
export async function load({ fetch, params, parent, route, url }) {

    let source = url?.searchParams?.get("source");
    if (!source || source == "") {
        source = "/";
    }
    
    return {
        // source is the site that triggered login via auth.ts
        source: source
    }

}