import { getTasks } from '$lib/server/data/tasks';
import { openMembershipApprovalTasks, answerToMembershipApproval, getMemberByEmail, getTaskStatus } from '$lib/server/db/members/member';
import { signIn } from '@auth/sveltekit/client';


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    
    // member info
    let session = await locals.getSession();
    // @ts-ignore
    const member = await getMemberByEmail(session?.user?.email);

    if (!member) {
        return {
            member: null,
            tasks: [],
            openTasks: [],
            taskStatus: {}
        }
    }

    return {
        member: member,
    }

}

/** @type {import('./$types').Actions} */
export const actions = {
    approveMember: async ({ cookies, request, locals }) => {

        let session = await locals.getSession();
        // @ts-ignore
        const member = await getMemberByEmail(session?.user?.email);
        if (!member) return { success: false, msg: "no member data" };

        const data = await request.formData();
        const approval = data.get('approval');
        const newMember = data.get('new_member');

        //console.log({ approval, newMember });

        // @ts-ignore
        await answerToMembershipApproval(member.id, newMember, approval);

        return { success: true };
    },
};
