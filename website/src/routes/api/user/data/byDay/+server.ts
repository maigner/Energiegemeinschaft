import { getEnergyData } from '$lib/server/db/energy/member';
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

export async function GET({ url, locals }) {
    const session = await locals.auth();

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

	// Extract query parameters
	const date = url.searchParams.get('date');       // e.g. '2025-07-07'
	const memberId = url.searchParams.get('memberId'); // e.g. '123'

	if (!date || !memberId) {
		return json({ error: 'Missing date or memberId' }, { status: 400 });
	}

	// Your business logic here (e.g., database call)
	const data = await getEnergyData(new Date(date), parseInt(memberId)); // ← your own function

	return json(data);
}