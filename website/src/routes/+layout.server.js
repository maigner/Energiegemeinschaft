import { cashierSession } from '$lib/server/db/members/authorization';
import { getBoardMemberByEmail } from '$lib/server/db/members/member';


/** @type {import('./$types').LayoutServerLoad} */
export async function load(event) {

	//console.log("layout.server.js");

	// receive session from authjs
	const session = await event.locals.auth();
	const isCashierSession = await cashierSession(session);


	// @ts-ignore
    const member = await getBoardMemberByEmail(session?.user?.email);


	return {
		session: session,
		isCashierSession: isCashierSession,
		member: member
	}
}