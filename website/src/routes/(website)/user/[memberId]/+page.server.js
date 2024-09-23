import { getMetricTimestampRange } from '$lib/server/db/members/member';
import { error } from '@sveltejs/kit';
import { signOut } from '../../../../auth';


export async function load({ params, parent, event }) {

    const {session, users} = await parent();

    //console.log({session});
    //console.log({params});


    let validUser = users.filter( user => 
        {
            return user.identifier === parseInt(params.memberId)
            && user.email === session.user.email;
        });
    
    //console.log({validUser});

    if (validUser.length === 0) {
        console.log("Unauthorized: " + session.user.email);
        signOut(event);
        console.log("Logging out");
        return error(403, 'not a valid user');
    }

    const user = validUser[0];

    return {
        user: user,
        averageMetrics: [],
        metricsTimestampRange: await getMetricTimestampRange(user.identifier),
    }


}