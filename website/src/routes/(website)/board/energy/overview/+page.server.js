import { getDailySums, getWeeklySums } from "$lib/server/db/energy/overview";


/** @type {import('../$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

   
    const weeklySums = await getWeeklySums();
    const dailySums = await getDailySums(30);

    return {
        weeklySums: weeklySums,
        dailySums: dailySums
    }

}