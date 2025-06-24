import { getMetricTimestampRange } from '$lib/server/db/members/member';
import { error } from '@sveltejs/kit';

export async function load({ params, parent }) {

    const { session, users } = await parent();


    let validUser = users.filter((/** @type {{ identifier: number; email: any; }} */ user) => {
        return user.identifier === parseInt(params.memberId)
            && user.email === session?.user?.email;
    });

    if (validUser.length === 0) {
        console.log("Unauthorized: " + session?.user?.email);
        //signOut(event);
        console.log("Logging out");
        console.log({ session });
        console.log({ params });
        return error(403, 'not a valid user');
    }

    const user = validUser[0];

    const metricsTimestampRange = await getMetricTimestampRange(user.identifier);

    // TODO: null check

    return {
        user: user,
        averageMetrics: [],
        metricsTimestampRange: metricsTimestampRange

    }


}