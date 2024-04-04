

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {



    const tasks = [
        {
            name: "membershipApproval",
            data: {
                newMember: {
                    name: "Familie X"
                }
            }

        },
    ]



    return {
        tasks: tasks
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
    approveMember: async ({ cookies, request }) => {
		const data = await request.formData();
		const email = data.get('email');
		const password = data.get('password');

		//console.log({data, email, password});

		return { success: true };
	},
};
