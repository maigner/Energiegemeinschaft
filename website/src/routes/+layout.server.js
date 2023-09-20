// https://kit.svelte.dev/docs/load#cookies

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ cookies }) {
	const sessionId = cookies.get('sessionid');
    console.log("layout.server.load");

	return {
		user: {name: "Martin", sessionId: sessionId}
	};
}