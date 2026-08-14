import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ parent }) {

    const { users } = await parent();

    // kein Mitglied -> Beitrittsantrag; genau ein Standort -> direkt hin
    // (serverseitig, damit nichts kurz aufblitzt und es ohne JS funktioniert)
    if (!users) {
        redirect(302, '/user/onboarding');
    }

    if (users.length === 1) {
        redirect(302, `/user/${users[0].identifier}`);
    }

    return {};
}
