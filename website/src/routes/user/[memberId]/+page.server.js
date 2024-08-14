import { getAverageMetrics, getMetricTimestampRange } from '$lib/server/db/members/member';
import { error } from '@sveltejs/kit';
import { signOut } from '../../../auth';


/** @type {import('../$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals, event }) {

    const {session, users} = await parent();

    //console.log(session.user.email);

    let validUser = users.filter( user => 
        {
            return user.identifier === parseInt(params.memberId)
            && user.email === session.user.email;
        });
    
    //console.log(validUser);

    if (validUser.length === 0) {
        console.log("Unauthorized: " + session.user.email);
        signOut(event);
        console.log("Logging out");
        return error(403, 'not a valid user');
    }

    const user = validUser[0];






    return {
        user: user,
        averageMetrics: await getAverageMetrics(user.identifier),
        metricsTimestampRange: await getMetricTimestampRange(user.identifier)
    }


}