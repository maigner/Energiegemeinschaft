import { getMembersWithPendingWelcome } from '$lib/server/db/members/member';
import { sendWelcomeEmails } from '$lib/server/mail/notifications/memberNotifications';

// Versand nur per POST (Aktion), nicht beim Laden - siehe poke/+page.server.js

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    return {
        pendingActiveNotifications: await getMembersWithPendingWelcome()
    };
}

/** @type {import('./$types').Actions} */
export const actions = {
    send: async () => {
        const pending = await getMembersWithPendingWelcome();
        await sendWelcomeEmails(pending);
        return { sent: pending.length };
    }
};
