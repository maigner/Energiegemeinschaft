import { dev } from '$app/environment';
import { getUsersByEmail } from '$lib/server/db/members/member';
import { relayDebug } from '$lib/server/mail/smtp';
import { getMemberPlants } from '$lib/server/db/members/openhabProvision';
import { secretsConfigured } from '$lib/server/secrets';

// Benachrichtigung über neue (Nicht-Mitglieds-)Logins nur einmal pro
// Serverlauf und E-Mail-Adresse, nicht bei jedem Seitenaufruf
const notifiedNewEmails = new Set();

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ parent, locals }) {

    // member info
    let { session } = await parent();

    // @ts-ignore
    const users = await getUsersByEmail(session?.user?.email);

    const email = session?.user?.email;
    if (!users && !dev && email && !notifiedNewEmails.has(email)) {
        notifiedNewEmails.add(email);
        // new email registered
        relayDebug("new email registered", session?.user);
    }

    // Standorte mit Speichermanagement (IBM-Anlage): steuert den Eintrag
    // in der Navigation
    /** @type {number[]} */
    const plantMembers = [];
    if (users && secretsConfigured()) {
        for (const user of users) {
            const plants = await getMemberPlants(user.identifier);
            if (plants.length > 0) plantMembers.push(user.identifier);
        }
    }

    return {
        users: users,
        plantMembers
    }

}
