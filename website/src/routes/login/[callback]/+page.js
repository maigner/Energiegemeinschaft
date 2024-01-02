import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export function load({ params }) {

    console.log(`login pageload: ${JSON.stringify(params)}`);

    return {
        callback: params.callback
    }

}