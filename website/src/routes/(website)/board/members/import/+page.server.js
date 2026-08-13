import { updateMissingMemberCoordinates } from "$lib/server/db/members/coordinates";
import { getMembersWithPendingWelcome } from "$lib/server/db/members/member";
import { sendWelcomeEmails } from "$lib/server/mail/notifications/memberNotifications";
import { importMemberDataFromNextcloud } from "$lib/server/nextcloud/members/memberdata";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const messagesImport = await importMemberDataFromNextcloud();

    await updateMissingMemberCoordinates();

    const pendingActiveNotifications = await getMembersWithPendingWelcome();

    await sendWelcomeEmails(pendingActiveNotifications);

    // Nur neu angelegte Datensätze anzeigen; Updates/Skips laufen weiter,
    // werden aber nicht gelistet.
    const inserted = messagesImport
        .filter((m) => m.startsWith("[INSERTED]"))
        .map((m) => m.replace(/^\[INSERTED\]\s*/, ""));

    return {
        messages: inserted
    }

}
