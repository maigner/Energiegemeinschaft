import { getBookings } from '$lib/server/db/finance/bookings';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, parent }) {

    // member info
    let { session, member } = await parent();

    //console.log({member});


    return {
        member: member,
        bookings: await getBookings(new Date("2023-09-01"), new Date("2024-09-30"))
    }

}
