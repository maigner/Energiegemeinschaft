
import { getUser } from '$lib/db/user';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    /*
        const { sql } = locals;
    
    
        //console.log(`page.server.js ${JSON.stringify(sql)}`);
    
        const query = await sql.query(`SELECT * FROM users`);
    
        await sql.end();
    
        console.log(query);
    
    
        return {
            dbTest: query.Result
        }
    
        import { connectToDB, pool } from "$lib/db";
    
        */

    //console.log(`get user: ${getUser()}`);
    /*
    const userInfo = await getUser().then( (r) => {
        console.log(r);
    });
    */



    const competitors = [
        {
            provider: "Energie AG",
            name: "Ökostrom Klassik",
            workPriceCentPerKWh: 26.14,
            base_price_per_year: 3.90 * 12,
            source: "https://www.energieag.at/privat/strom",
            date: "1. Jänner 2024"
        },
        {
            provider: "Verbund",
            name: "Strom aus 100% Wasserkraft",
            workPriceCentPerKWh: 26.40,
            base_price_per_year: 4.79 * 12,
            source: "https://www.verbund.com/de-at/privatkunden/strom",
            date: "1. Jänner 2024"
        },
        {
            provider: "GoGreenEnergy",
            name: "Stromtarif",
            workPriceCentPerKWh: 23.40,
            base_price_per_year: 5.0 * 12,
            source: "https://www.gogreenenergy.at",
            date: "1. Jänner 2024"
        }
    ]



    return {
        selfUseRatio: 1 / 3,
        eegSellsCentPerKilowatt: 11.0,
        eegBuysCentPerKilowatt: 11.0,
        competitors: competitors,
        networkUseFeeCentPerKWh: 5.12,
        regionalEEGNetworkDeductionFactor: 0.28
    }

}