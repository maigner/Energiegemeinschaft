import { getAverageMetrics } from '$lib/server/db/members/member';
import { json } from '@sveltejs/kit';



// authenticate by token
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {

    const { userId, startDate, endDate } = await request.json();

    

    console.log({userId, startDate, endDate});

    const result = await getAverageMetrics(userId, startDate, endDate);


    
    return json(
        result
    );

}