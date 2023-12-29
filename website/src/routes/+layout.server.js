

/** @type {import('./$types').LayoutServerLoad} */
export async function load(event) {

	// receive session from authjs
	const session = await event.locals.getSession();
	return {
		session
	}
}