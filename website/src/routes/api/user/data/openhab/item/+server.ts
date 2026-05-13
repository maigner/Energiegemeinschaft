import { getEnergyData } from '$lib/server/db/energy/member';
import { getAverageMetrics } from '$lib/server/db/members/member';
import { getItems, getItemStateHistory } from '$lib/server/db/members/openhab.js';
import { json } from '@sveltejs/kit';





export async function GET({ url, locals }) {
    const session = await locals.auth();

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

	// Extract query parameters
	const dateString = url.searchParams.get('date');       
	const memberIdentifierString = url.searchParams.get('memberIdentifier'); // e.g. '123'
    const itemName = url.searchParams.get('itemName'); // e.g. 'Fronius_Symo_Inverter_Grid_Power'

    console.log({ dateString, memberIdentifierString, itemName });

	if (!dateString || !memberIdentifierString || !itemName) {
		return json({ error: 'Missing params' }, { status: 400 });
	}

    const date = new Date(dateString);
    const memberIdentifier = parseInt(memberIdentifierString, 10);

    console.log({ date, memberIdentifier, itemName });

	const availableItems = await getItems(memberIdentifier);


    // get id of item with given name
    const item = availableItems.find(i => i.itemname === itemName);
    if (!item) {
        return json({ error: 'Item not found' }, { status: 404 });
    }
    const itemId = item.itemid;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const itemData = await getItemStateHistory(memberIdentifier, itemId, startOfDay, endOfDay);

	
	return json(itemData);
}