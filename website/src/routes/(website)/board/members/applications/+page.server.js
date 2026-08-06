import { getMembershipApplications } from "$lib/server/db/members/applications";

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    return {
        applications: await getMembershipApplications()
    };
}
