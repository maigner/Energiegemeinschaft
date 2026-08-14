import { getMetricTimestampRange, getMemberMeasurementPoints } from '$lib/server/db/members/member';
import { error } from '@sveltejs/kit';

export async function load({ params, parent }) {

    const { session, users } = await parent();

    let validUser = (users ?? []).filter((/** @type {{ identifier: number; email: any; }} */ user) => {
        return user.identifier === parseInt(params.memberId)
            && user.email?.toLowerCase() === session?.user?.email?.toLowerCase();
    });

    if (validUser.length === 0) {
        console.log(`unauthorized access attempt on /user/${params.memberId}`);
        return error(403, 'not a valid user');
    }

    const user = validUser[0];

    // null, solange noch keine Messwerte geliefert wurden (frisch aktivierte
    // Mitglieder) -- die Seite zeigt dann einen Hinweis statt des Charts
    const metricsTimestampRange = await getMetricTimestampRange(user.identifier);

    const measurementPoints = await getMemberMeasurementPoints(user.identifier);

    return {
        user: user,
        averageMetrics: [],
        metricsTimestampRange: metricsTimestampRange,
        measurementPoints: measurementPoints
    }

}
