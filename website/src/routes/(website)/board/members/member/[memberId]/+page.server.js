import { getMember, getMetricTimestampRange } from '$lib/server/db/members/member';
import { error } from '@sveltejs/kit';

export async function load({ params, parent }) {

    const { session } = await parent();

    //console.log({session});
    //console.log({params});


    const metricsTimestampRange = await getMetricTimestampRange(parseInt(params.memberId));

    const member = await getMember(parseInt(params.memberId));

    // TODO: null check

    return {
        user: member,
        averageMetrics: [],
        metricsTimestampRange: metricsTimestampRange
        
    }


}