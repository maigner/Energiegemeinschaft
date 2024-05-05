import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent }) {

    console.log(`Callback: ${params.callback}`)

    return {
        callback: params.callback.replaceAll("_", "/")
    }

}