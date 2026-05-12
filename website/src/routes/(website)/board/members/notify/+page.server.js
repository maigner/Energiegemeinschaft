import { getMembersWithPendingWelcome } from '$lib/server/db/members/member';
import { sendWelcomeEmails } from '$lib/server/mail/notifications/memberNotifications';

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const pendingActiveNotifications = await getMembersWithPendingWelcome();


    await sendWelcomeEmails(pendingActiveNotifications);


    return {
        pendingActiveNotifications:  pendingActiveNotifications
    }

}