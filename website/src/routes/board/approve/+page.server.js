import { openMembershipApprovalTasks, answerToMembershipApproval, getMemberByEmail } from '$lib/server/db/members/member';


/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const tasks = [
        {
            name: "membershipApproval",
            data: {
                newMember: {
                    name: "Familie Y"
                }
            }

        },
		{
            name: "membershipApproval",
            data: {
                newMember: {
                    name: "Herr Sowieso"
                }
            }

        },
    ];

    let session = await locals.getSession();
    const member = await getMemberByEmail(session?.user?.email);

    const new_member_names = tasks.map( (task) => {
        return task.data.newMember.name;
    } );
    let memberNames = await openMembershipApprovalTasks(member[0].id, new_member_names);
    let openTasks = tasks.filter((task) => {
        return !memberNames.includes(task.data.newMember.name);
    });

    return {
        member: member,
        tasks: openTasks
    }

}

/** @type {import('./$types').Actions} */
export const actions = {
	login: async ({ cookies, request }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');

		const user = await db.getUser(email);
		cookies.set('sessionid', await db.createSession(user), { path: '/' });

		return { success: true };
	},
	register: async (event) => {
		// TODO register the user
	},
    approveMember: async ({ cookies, request, locals }) => {

        let session = await locals.getSession();
        const member = await getMemberByEmail(session?.user?.email);


		const data = await request.formData();
		const approval = data.get('approval');
        const newMember = data.get('new_member');

		console.log({ approval, newMember});

        await answerToMembershipApproval(member[0].id, newMember, approval);

		return { success: true };
	},
};
