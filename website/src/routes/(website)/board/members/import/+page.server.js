import { updateMissingMemberCoordinates } from "$lib/server/db/members/coordinates";
import { getMembersWithPendingWelcome } from "$lib/server/db/members/member";
import { sendWelcomeEmails } from "$lib/server/mail/notifications/memberNotifications";
import { importMemberDataFromNextcloud } from "$lib/server/nextcloud/members/memberdata";


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const { file, messages } = await importMemberDataFromNextcloud();

    await updateMissingMemberCoordinates();

    const pendingActiveNotifications = await getMembersWithPendingWelcome();

    await sendWelcomeEmails(pendingActiveNotifications);

    // Nur neu angelegte Datensätze werden gelistet; Updates/Skips laufen
    // weiter und werden nur gezählt, damit ein Lauf ohne neue Datensätze
    // von einem fehlgeschlagenen Lauf unterscheidbar bleibt.
    /** @param {string} action */
    const countByAction = (action) =>
        messages.filter((m) => m.startsWith(`[${action}]`)).length;

    const inserted = messages
        .filter((m) => m.startsWith("[INSERTED]"))
        .map((m) => m.replace(/^\[INSERTED\]\s*/, ""));

    return {
        file,
        counts: {
            inserted: countByAction("INSERTED"),
            updated: countByAction("UPDATED"),
            skipped: countByAction("SKIPPED")
        },
        messages: inserted
    }

}
