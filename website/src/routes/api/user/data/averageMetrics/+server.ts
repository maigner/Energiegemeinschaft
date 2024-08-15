import { getAverageMetrics } from '$lib/server/db/members/member';
import { json } from '@sveltejs/kit';



// authenticate by token
/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    //console.log({event});

    const session = await event.locals.auth();

    //session?.user?.email
    //console.log(session.user.email);

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    const { userId, startDate, endDate } = await event?.request?.json();



    //console.log({ userId, startDate, endDate });

    const result = await getAverageMetrics(userId, startDate, endDate);



    return json(
        result
    );

}