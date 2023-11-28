
import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').LayoutServerLoad} */


export async function load(event) {

	const whitelist = [
		'admin@maigner.net'
	];


	const session = await event.locals.getSession();

	
	if (!session) {
		//throw redirect(307, 'auth/signin');
	}
	

	console.log("layout.server.load");

	console.log(session);

	
	if (!whitelist.find((email) => email == session?.user?.email)) {
		//throw redirect(307, 'auth/signin');
	}
	

	return {
		session
	}

}