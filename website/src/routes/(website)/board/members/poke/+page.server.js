import { getMembersWithInvalidMeasurementPoints, getMembersWithPendingMeasurementPoints } from "$lib/server/db/members/member";
import { sendActivationReminders } from "$lib/server/mail/reminders/memberReminders";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {



    await sendActivationReminders();


    return {
    }


}