import { updateMissingMemberCoordinates } from "$lib/server/db/members/coordinates";
import { getMembersWithPendingWelcome } from "$lib/server/db/members/member";
import { sendWelcomeEmails } from "$lib/server/mail/notifications/memberNotifications";
import { importMemberDataFromNextcloud } from "$lib/server/nextcloud/members/memberdata";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const messagesImport = await importMemberDataFromNextcloud();


    const messagesCoordinates = await updateMissingMemberCoordinates();


    const pendingActiveNotifications = await getMembersWithPendingWelcome();


    await sendWelcomeEmails(pendingActiveNotifications);


    return {
        messages: [...messagesImport, ...messagesCoordinates]
    }

}