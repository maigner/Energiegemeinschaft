import { middlewareDbConnection } from '$lib/server/db/db';
import { getAverageMetrics } from '$lib/server/db/members/member';
import { json } from '@sveltejs/kit';



const answerToMembershipApproval = async (
    boardMemberId: number, newMemberName: string, answer: string, newMemberEmail: string) => {

    const client = await middlewareDbConnection();

    try {
        await client.query('BEGIN');
        const selectQuery = `
        SELECT member_id, new_member_email 
        FROM members_boardapproval 
        WHERE member_id = $1
        and new_member_email like $2
        `;

        const selectValues = [boardMemberId, newMemberEmail];
        const { rows } = await client.query(selectQuery, selectValues);

        console.log(rows);
        if (!rows[0]) {

            await client.query(`
            insert into 
            members_boardapproval (date_time, member_id, new_member_approved, answer, new_member_email)
            values (NOW(), $1, $2, $3, $4)
            `, [boardMemberId, newMemberName, answer, newMemberEmail]);
        }

        await client.query('COMMIT');
        //console.log('Transaction committed successfully');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error executing transaction:', e);
    } finally {
        client.release();
    }
};


/** @type {import('../../$types').RequestHandler} */
export async function POST(event) {

    //console.log({event});

    const session = await event.locals.auth();

    //session?.user?.email
    console.log({session});

    if (!session?.user?.email) {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    if (session?.user?.email !== "martin@maigner.net") {
        return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    
    const { bookingId, labelId } = await event?.request?.json();






    console.log({ bookingId, labelId });

    const result = {foo: "bar"};



    return json(
        result
    );

}