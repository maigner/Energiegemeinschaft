import { getTasks } from '$lib/server/data/tasks';
import { openMembershipApprovalTasks, answerToMembershipApproval, getMemberByEmail, getTaskStatus } from '$lib/server/db/members/member';


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const tasks = getTasks();

    // member info
    let session = await locals.getSession();
    const member = await getMemberByEmail(session?.user?.email);

    if (typeof member[0] === "undefined") {
        return {
            member: null,
            tasks: [],
            openTasks: [],
            taskStatus: {}
        }
    }

    // what tasks are open to user?
    const new_member_names = tasks.map((task) => {
        return task.data.newMember.name;
    });
    let memberNames = await openMembershipApprovalTasks(member[0].id, new_member_names);
    let openTasks = tasks.filter((task) => {
        return !memberNames.includes(task.data.newMember.name);
    });

    // overall task status
    let taskStatus = await getTaskStatus(new_member_names);


    return {
        tasks: tasks,
        member: member,
        taskStatus: taskStatus,
        openTasks: openTasks
    }

}

/** @type {import('./$types').Actions} */
export const actions = {
    approveMember: async ({ cookies, request, locals }) => {

        let session = await locals.getSession();
        const member = await getMemberByEmail(session?.user?.email);

        const data = await request.formData();
        const approval = data.get('approval');
        const newMember = data.get('new_member');

        console.log({ approval, newMember });

        await answerToMembershipApproval(member[0].id, newMember, approval);

        return { success: true };
    },
};
