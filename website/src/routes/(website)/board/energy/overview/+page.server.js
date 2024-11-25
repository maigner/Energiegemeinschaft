import { getWeeklySums } from "$lib/server/db/energy/overview";


/** @type {import('../$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

   
    const weeklySums = await getWeeklySums();

    return {
        weeklySums: weeklySums,
    }

}