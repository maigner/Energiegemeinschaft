import { cashierSession } from '$lib/server/db/members/authorization';
import { getBoardMemberByEmail, getCommunityMembersByEmail } from '$lib/server/db/members/member';


/** @type {import('./$types').LayoutServerLoad} */
export async function load(event) {

	//console.log("layout.server.js");

	// receive session from authjs
	const session = await event.locals.auth();
	const isCashierSession = await cashierSession(session);


	// @ts-ignore
	/**
	 * 
	 */
    const boardMember = await getBoardMemberByEmail(session?.user?.email);

	// one email may be attached to multiple members
	// that email is treatet as a "manager" role for all associated members
	const communityMembers = await getCommunityMembersByEmail(session?.user?.email);




	return {
		session: session,
		isCashierSession: isCashierSession,
		boardMember: boardMember,
		communityMembers: communityMembers
	}
}