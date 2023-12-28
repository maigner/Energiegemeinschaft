
import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').LayoutServerLoad} */
export async function load(event) {



	const session = await event.locals.getSession();

	console.log("layout.server.load");

	console.log(session);
	

	return {
		session
	}
	

}