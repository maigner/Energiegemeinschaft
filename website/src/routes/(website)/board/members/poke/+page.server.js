import { getMembersWithPendingMeasurementPointsForFirstReminder, getMembersWithPendingMeasurementPointsForSecondReminder } from "$lib/server/db/members/member";
import { sendActivationReminders } from "$lib/server/mail/reminders/memberReminders";

// Versand nur per POST (Aktion), nicht beim Laden: GET-Seiten werden vom
// Browser beim Hover vorgeladen (data-sveltekit-preload-data) und von
// Links aus aufgerufen - Mails duerfen daran nicht haengen.

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    return {
        first: await getMembersWithPendingMeasurementPointsForFirstReminder(),
        second: await getMembersWithPendingMeasurementPointsForSecondReminder()
    };
}

/** @type {import('./$types').Actions} */
export const actions = {
    send: async () => {
        await sendActivationReminders();
        return { sent: true };
    }
};
