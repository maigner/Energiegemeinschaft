import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent }) {

    console.log(`login pageload: ${JSON.stringify(params)}`);

    return {
        callback: params.callback
    }

}