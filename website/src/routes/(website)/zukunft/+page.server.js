import { getMeasurementPoints } from '$lib/server/db/energy/member.js';
import { getForecast } from '$lib/server/db/weather/forecast.js';
import { error } from '@sveltejs/kit';

export async function load({ params, parent }) {

    const { session, communityMembers } = await parent();


    let validUser = communityMembers.filter((/** @type {{ email: any; }} */ user) => {
        return user.email === session?.user?.email;
    });

    if (validUser.length === 0) {
        console.log("Unauthorized: " + session?.user?.email);
        //signOut(event);
        console.log("Logging out");
        console.log({ session });
        console.log({ params });
        return error(403, 'not a valid user');
    }

    // add measurement points to each user of this session email
    communityMembers.forEach(async obj => {
        obj.measurementPoints = await getMeasurementPoints(obj.id);
    })


    // TODO: null check

    return {
        forecast: await getForecast()
    }


}