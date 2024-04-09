import { middlewareDbConnection, middlewareDbPool } from "$lib/server/db/db";


export const getMembers = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member`);
    await sql.end();
    sql.release();
    return result?.rows;
};

export const getMemberByEmail = async (email: string) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member
    where email like $1`, [email]);
    await sql.end();
    sql.release();
    return result?.rows;
};

export const isMember = async (email: string) => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member`);
    await sql.end();
    sql.release();
    return result?.rows;
};


export const openMembershipApprovalTasks = async (boardMemberId: string, new_member_names: string[]) => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select * 
        from members_boardapproval mba
        inner join members_member member
        on mba.member_id = member.id
        where
        member.id = $2
        and new_member_approved = any ($1)`, [new_member_names, boardMemberId]);
    await sql.end();
    sql.release();
    const rows = result?.rows;

    const opentasks = rows.map((it : any) => it.new_member_approved);
    console.log(opentasks)
    return opentasks
};


export const answerToMembershipApproval = async (boardMemberId: number, newMemberName: string, answer: string) => {
    middlewareDbPool.connect((err, client, done) => {
        client.query(`
        insert into 
        members_boardapproval (date_time, member_id, new_member_approved, answer)
        values (NOW(), $1, $2, $3)
        `,
            [boardMemberId, newMemberName, answer], (err, result) => {
                done();

                if (err) {
                    console.error('Error executing query', err.stack);
                    return;
                }

                console.log('New event added:', result.rows[0]);
            });
    });
};


export const getTaskStatus = async (newMemberNames: string[]) => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select count(*), mba.answer, mba.new_member_approved 
        from members_boardapproval mba
        where new_member_approved = any ($1)
        group by mba.answer, mba.new_member_approved 
        `, [newMemberNames]);
    await sql.end();
    sql.release();
    const rows = result?.rows;

    let taskStatus = {};

    const status = rows.map((row) => 
        {
            if (!(row.new_member_approved in taskStatus)) {
                taskStatus[row.new_member_approved] = {
                    Ja: 0,
                    Nein: 0
                };
            }
            taskStatus[row.new_member_approved][row.answer] = parseInt(row.count)
        }
    );
    console.log(taskStatus);
    return taskStatus
};