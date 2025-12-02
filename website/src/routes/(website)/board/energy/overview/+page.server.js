import { getDailySums, getWeeklySums, getYearlySums } from "$lib/server/db/energy/overview";


/** @type {import('../$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {


    const weeklySums = await getWeeklySums();
    const dailySums = await getDailySums(30);
    const yearlySums = await getYearlySums();

    return {
        weeklySums: weeklySums,
        dailySums: dailySums,
        yearlySums: yearlySums
    }

}