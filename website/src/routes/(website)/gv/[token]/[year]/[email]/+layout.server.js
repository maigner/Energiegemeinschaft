import { NEWSLETTER_TOKEN_GV_2024 } from '$env/static/private';
import { getUsersByEmail } from '$lib/server/db/members/member';

function validateEmail(email) {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
}

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ parent, locals, params }) {

    // member info
    let { session } = await parent();

    // @ts-ignore
    const users = await getUsersByEmail(session?.user?.email);

    console.log({ params });

    if (params.token !== NEWSLETTER_TOKEN_GV_2024) {
        return {
            error: "invalid token"
        }
    }

    if (!validateEmail(params.email)) {
        return {
            error: "invalid email"
        }
    }


    // save registration!


    return {
        users: users,
        newsletterEmail: params.email
    }

}
