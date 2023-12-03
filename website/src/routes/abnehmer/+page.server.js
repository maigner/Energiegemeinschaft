import { EEG_CENTRAL_TOKEN, EEG_CENTRAL_ENDPOINT } from "$env/static/private";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent }) {

    /*

    //let d = await parent();

    const response = await fetch(`${EEG_CENTRAL_ENDPOINT}/test`, {
        headers: {
            Authorization: "Bearer " + EEG_CENTRAL_TOKEN,
        },
    });
    response.json().then((data) => {
        console.log(data);
    });
    */

    return {
        self_use_ratio: 1 / 3,
        sell_cent_per_kilowatt: 10.0,
        buy_cent_per_kilowatt: 11.0
    }
	
}