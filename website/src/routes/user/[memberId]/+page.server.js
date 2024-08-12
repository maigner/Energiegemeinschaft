import { error } from '@sveltejs/kit';


/** @type {import('../$types').PageServerLoad} */
export async function load({ fetch, params, parent, locals }) {

    const {session, users} = await parent();

    console.log(session.user.email);



    let validUser = users.filter( user => 
        {
            return user.identifier === parseInt(params.memberId)
            //&& user.email === session.user.email;
            && user.email === "th.sams@schiffersams.at";
        });
    
    console.log(validUser);

    if (validUser.length === 0) {
        return error(403, 'not a valid user');
    }


    return {
        user: validUser[0]
    }



}