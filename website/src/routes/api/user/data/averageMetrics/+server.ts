import { getAverageMetrics, getMetricTotals } from '$lib/server/db/members/member';
import { canAccessMemberData } from '$lib/server/db/members/authorization';
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

    if (!(await canAccessMemberData(session, { memberIdentifier: Number(userId), endpoint: "/api/user/data/averageMetrics" }))) {
        return new Response(null, { status: 403, statusText: "Forbidden" });
    }

    const [averageMetrics, totals] = await Promise.all([
        getAverageMetrics(userId, startDate, endDate),
        getMetricTotals(userId, startDate, endDate),
    ]);

    return json({ averageMetrics, totals });

}