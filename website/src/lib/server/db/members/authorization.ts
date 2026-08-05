import { CASHIER1, CASHIER2, CHAIR1, CHAIR2, CONTROLLER1 } from "$env/static/private";
import { getBoardMemberByEmail, getCommunityMembersByEmail } from "$lib/server/db/members/member";


/**
 * True when the session user may read data of the given member:
 * one of their own members (same login email) or any member if they are
 * on the board.
 */
export const canAccessMemberData = async (
    session: any,
    { memberId, memberIdentifier }:
        { memberId?: number, memberIdentifier?: number }
) => {
    const email = session?.user?.email;
    if (!email) return false;

    const ownMembers = await getCommunityMembersByEmail(email) ?? [];
    const isOwn = ownMembers.some((member: any) =>
        (memberId !== undefined && Number(member.id) === memberId) ||
        (memberIdentifier !== undefined && Number(member.identifier) === memberIdentifier));
    if (isOwn) return true;

    return Boolean(await getBoardMemberByEmail(email));
};


export const cashierSession = async (session: any) => {
    //console.log({session});
    if (session?.user?.email === CHAIR1) {
        return true;
    }
    if (session?.user?.email === CHAIR2) {
        return true;
    }
    if (session?.user?.email === CASHIER1) {
        return true;
    }
    if (session?.user?.email === CASHIER2) {
        return true;
    }
    if (session?.user?.email === CONTROLLER1) {
        return true;
    }
    return false;
}