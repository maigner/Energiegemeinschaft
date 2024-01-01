

/** @type {import('./$types').LayoutServerLoad} */
export async function load(event) {

	//console.log("layout.server.js");

	// receive session from authjs
	const session = await event.locals.getSession();
	return {
		session: session
	}
}