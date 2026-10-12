import { env } from "$env/dynamic/private";
import { getBoardMemberByEmail, getCommunityMembersByEmail } from "$lib/server/db/members/member";
import { middlewareDbConnection } from "$lib/server/db/db";


/**
 * Vorstands-Zugriffe auf Daten fremder Mitglieder werden protokolliert
 * (Art. 32 DSGVO, Nachvollziehbarkeit). Eintraege aelter als ein Jahr
 * loescht der taegliche Retention-Cron.
 */
const logBoardAccess = async (
    accessorEmail: string,
    memberIdentifier: number,
    endpoint: string
) => {
    try {
        const sql = await middlewareDbConnection();
        try {
            await sql.query(`
                INSERT INTO members_memberdataaccesslog
                    (created_at, accessor_email, member_identifier, endpoint)
                VALUES (NOW(), $1, $2, $3)
            `, [accessorEmail, memberIdentifier, endpoint]);
        } finally {
            sql.release();
        }
    } catch (error: any) {
        // Protokollfehler duerfen den Zugriff nicht blockieren
        console.error("failed to write member data access log:", error?.message ?? error);
    }
};

/**
 * True when the session user may read data of the given member:
 * one of their own members (same login email) or any member if they are
 * on the board. Board access to other members' data is logged.
 */
export const canAccessMemberData = async (
    session: any,
    { memberId, memberIdentifier, endpoint }:
        { memberId?: number, memberIdentifier?: number, endpoint?: string }
) => {
    const email = session?.user?.email;
    if (!email) return false;

    const ownMembers = await getCommunityMembersByEmail(email) ?? [];
    const isOwn = ownMembers.some((member: any) =>
        (memberId !== undefined && Number(member.id) === memberId) ||
        (memberIdentifier !== undefined && Number(member.identifier) === memberIdentifier));
    if (isOwn) return true;

    const isBoardMember = Boolean(await getBoardMemberByEmail(email));
    if (isBoardMember) {
        await logBoardAccess(
            email,
            memberIdentifier ?? memberId ?? -1,
            endpoint ?? ""
        );
    }
    return isBoardMember;
};


/**
 * Guard for /api/finance endpoints: returns an error Response when the
 * request is not from a cashier session, null when access is allowed.
 * 401 = not logged in, 403 = logged in but not a cashier.
 */
export const cashierGuard = async (locals: any): Promise<Response | null> => {
    const session = await locals.auth();
    if (!session) {
        return new Response(null, { status: 401, statusText: "Unauthorized" });
    }
    if (!(await cashierSession(session))) {
        return new Response(null, { status: 403, statusText: "Forbidden" });
    }
    return null;
};

export const cashierSession = async (session: any) => {
    const email = typeof session?.user?.email === "string" ? session.user.email.trim().toLowerCase() : "";
    if (!email) return false;
    // Rollen aus der Umgebung; leere oder fehlende Eintraege zaehlen nie
    // (sonst waere undefined === undefined ein Treffer)
    const roles = [env.CHAIR1, env.CHAIR2, env.CASHIER1, env.CASHIER2, env.CONTROLLER1, env.CONTROLLER2]
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim().toLowerCase());
    return roles.includes(email);
}