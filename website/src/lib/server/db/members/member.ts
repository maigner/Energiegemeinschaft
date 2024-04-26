import { middlewareDbConnection, middlewareDbPool } from "$lib/server/db/db";




export const getBoardMemberByEmail = async (email: string) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member
    where email like $1 and board_member = true`, [email]);
    await sql.end();
    sql.release();
    return (result?.rows.length > 0 ? result?.rows[0] : null);
};




export const completedMembershipApprovalTasks = async (boardMemberId: string, new_member_emails: string[]) => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select * 
        from members_boardapproval mba
        inner join members_member member
        on mba.member_id = member.id
        where
        member.id = $2
        and new_member_email = any ($1)`, [new_member_emails, boardMemberId]);
    await sql.end();
    sql.release();
    const rows = result?.rows;

    const opentasks = rows.map((it: any) => it.new_member_email);
    //console.log(opentasks)
    return opentasks
};


export const getAllMembershipApprovalTasks = async() => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select * 
        from members_memberapprovaltask
        `);
    await sql.end();
    sql.release();
    const rows = result?.rows;

    const status = rows.map((row) => {
        return {
            name: "membershipApproval",
            data: {
                newMember: {
                    name: row.name,
                    address: row.address,
                    email: row.email
                }
            }
        }
    }
    );
    //console.log(status);
    return status

};



export const answerToMembershipApproval = async (
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
    } catch(e) {
        await client.query('ROLLBACK');
        console.error('Error executing transaction:', e);
    }
};



export const getTaskStatus = async (newMemberEmails: string[]) => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select count(*), mba.answer, mba.new_member_email, mba.new_member_approved 
        from members_boardapproval mba
        where new_member_email = any ($1)
        group by mba.answer, mba.new_member_email, mba.new_member_approved
        `, [newMemberEmails]);
    await sql.end();
    sql.release();
    const rows = result?.rows;

    //console.log(rows);

    let taskStatus: Record<string, any> = {};

    const status = rows.map((row: { new_member_approved: string; answer: string; count: string; }) => {
        if (!(row.new_member_approved in taskStatus)) {
            taskStatus[row.new_member_approved] = {
                Ja: 0,
                Nein: 0
            };
        }
        taskStatus[row.new_member_approved][row.answer] = parseInt(row.count)
    }
    );

    //console.log(taskStatus);

    // filter for tasks where JA < 7 (num board members)
    taskStatus = Object.fromEntries(
        Object.entries(taskStatus).filter( ([key, value]) => value.Ja < 7)
    );

    //console.log(taskStatus);

    return taskStatus
};