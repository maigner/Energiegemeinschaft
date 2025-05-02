import { completedMembershipApprovalTasks, answerToMembershipApproval, getBoardMemberByEmail, getTaskStatus, getAllMembershipApprovalTasks } from '$lib/server/db/members/member';


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    //const tasks = getTasks();
    const tasks = await getAllMembershipApprovalTasks();



    const { boardMember } = await parent()

    if (!boardMember) {
        return {
            boardMember: null,
            tasks: [],
            openTasks: [],
            taskStatus: {}
        }
    }

    // what tasks are open to user?
    const new_member_emails = tasks.map((/** @type {{ data: { newMember: { email: any; }; }; }} */ task) => {
        return task.data.newMember.email;
    });
    
    let memberEmails = await completedMembershipApprovalTasks(boardMember.id, new_member_emails);
    let openTasks = tasks.filter((/** @type {{ data: { newMember: { email: any; }; }; }} */ task) => {
        return !memberEmails.includes(task.data.newMember.email);
    });

    // overall task status
    let taskStatus = await getTaskStatus(new_member_emails);



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
        const newMemberEmail = data.get('new_member_email');

        //console.log({ approval, newMember });

        // @ts-ignore
        await answerToMembershipApproval(member.id, newMember, approval, newMemberEmail);

        return { success: true };
    },
};
