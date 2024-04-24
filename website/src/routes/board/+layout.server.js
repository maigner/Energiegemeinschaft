import { getTasks } from '$lib/server/data/tasks';
import { openMembershipApprovalTasks, answerToMembershipApproval, getMemberByEmail, getTaskStatus } from '$lib/server/db/members/member';
import { signIn } from '@auth/sveltekit/client';


/** @type {import('./$types').LayoutServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    // member info
    let session = await locals.getSession();
    // @ts-ignore
    const member = await getMemberByEmail(session?.user?.email);

    return {
        member: member,
    }

}
