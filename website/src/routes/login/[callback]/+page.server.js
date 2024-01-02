import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent }) {

    return {
        callback: params.callback
    }

}