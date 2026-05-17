import { getEnergyData } from '$lib/server/db/energy/member';
import { getAverageMetrics } from '$lib/server/db/members/member';
import { getItems, getItemStateHistory } from '$lib/server/db/members/openhab.js';
import { json } from '@sveltejs/kit';

import { startOfDay, endOfDay } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';



export async function GET({ url, locals }) {
    const session = await locals.auth();

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    // Extract query parameters
    const startDateString = url.searchParams.get('startDate');
    const endDateString = url.searchParams.get('endDate');
    const memberIdentifierString = url.searchParams.get('memberIdentifier'); // e.g. '123'
    const itemName = url.searchParams.get('itemName'); // e.g. 'Fronius_Symo_Inverter_Grid_Power'

    console.log({ startDateString, endDateString, memberIdentifierString, itemName });

    if (!startDateString || !endDateString || !memberIdentifierString || !itemName) {
        return json({ error: 'Missing params' }, { status: 400 });
    }

    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);
    const memberIdentifier = parseInt(memberIdentifierString, 10);

    console.log({ startDate, endDate, memberIdentifier, itemName });

    const availableItems = await getItems(memberIdentifier);


    // get id of item with given name
    const item = availableItems.find(i => i.itemname === itemName);
    if (!item) {
        return json({ error: 'Item not found' }, { status: 404 });
    }
    const itemId = item.itemid;

    const timeZone = 'Europe/Vienna';
    const zonedStartDate = toZonedTime(startDate, timeZone);
    const zonedEndDate = toZonedTime(endDate, timeZone);
    const start = fromZonedTime(startOfDay(zonedStartDate), timeZone);
    const end = fromZonedTime(endOfDay(zonedEndDate), timeZone);

    const itemData = await getItemStateHistory(memberIdentifier, itemId, start, end);


    return json(itemData);
}