
/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent }) {

    return {
        self_use_ratio: 1 / 3,
        sell_cent_per_kilowatt: 10.0,
        buy_cent_per_kilowatt: 11.0
    }
	
}