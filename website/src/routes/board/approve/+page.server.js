import { getTasks } from '$lib/server/data/tasks';
import { openMembershipApprovalTasks, answerToMembershipApproval, getBoardMemberByEmail, getTaskStatus } from '$lib/server/db/members/member';


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const tasks = getTasks();

    const { member } = await parent()

    if (!member) {
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
    let memberNames = await openMembershipApprovalTasks(member.id, new_member_names);
    let openTasks = tasks.filter((task) => {
        return !memberNames.includes(task.data.newMember.name);
    });

    // overall task status
    let taskStatus = await getTaskStatus(new_member_names);



    return {
        tasks: tasks,
        taskStatus: taskStatus,
        openTasks: openTasks
    }

}

/** @type {import('./$types').Actions} */
export const actions = {
    approveMember: async ({ cookies, request, locals }) => {

        let session = await locals.getSession();
        // @ts-ignore
        const member = await getBoardMemberByEmail(session?.user?.email);
        if (!member) return { success: false, msg: "No Member data" };

        const data = await request.formData();
        const approval = data.get('approval');
        const newMember = data.get('new_member');

        //console.log({ approval, newMember });

        // @ts-ignore
        await answerToMembershipApproval(member.id, newMember, approval);

        return { success: true };
    },
};
