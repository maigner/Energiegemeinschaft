import { middlewareDbConnection } from "$lib/server/db/db";


export const getBoardMemberByEmail = async (email: string) => {
    if (!email) return null;
    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member
    where email like $1 and board_member = true`, [email]);
    sql.release();
    return (result?.rows.length > 0 ? result?.rows[0] : null);
};

export const getCommunityMembersByEmail = async (email: string) => {
    if (!email) return null;
    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member
    where email like $1`, [email]);
    sql.release();
    return (result?.rows.length > 0 ? result?.rows : null);
};

//getUserByEmail
export const getUsersByEmail = async (email: string) => {
    if (!email) return null;
    const sql = await middlewareDbConnection();
    const result = await sql.query(`SELECT * FROM members_member
    where email like $1`, [email]);
    sql.release();
    return (result?.rows.length > 0 ? result?.rows : null);
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
    sql.release();
    const rows = result?.rows;

    const opentasks = rows.map((it: any) => it.new_member_email);
    //console.log(opentasks)
    return opentasks
};


export const getAllMembershipApprovalTasks = async () => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select * 
        from members_memberapprovaltask
        `);
    sql.release();
    const rows = result?.rows;

    const status = rows.map((row: { name: any; address: any; email: any; }) => {
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
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error executing transaction:', e);
    } finally {
        client.release();
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
        Object.entries(taskStatus).filter(([key, value]) => value.Ja < 7)
    );

    //console.log(taskStatus);

    return taskStatus
};


export const getMemberLocations = async () => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select id, email, name, latitude, longitude
        from members_member
        `);
    sql.release();
    const rows = result?.rows;
    return rows;

};


export const getNumberOfMembersStats = async () => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        WITH date_series AS (
        SELECT generate_series(
                    date_trunc('day', '2024-01-01'::date),
                    date_trunc('day', CURRENT_DATE),
                    '1 day'::interval
            ) AS month
        )
        SELECT
            month, count(m.identifier) as num_members
        FROM
            date_series, members_member m
        WHERE m.member_since <= month
        group by month
        order by month
        ;
        `);
    sql.release();
    const rows = result?.rows;
    return rows;

};



export const getMeasurementPoints = async () => {

    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select 
            mp.id as mp_id, mp.identifier as mp_identifier, 
            * from members_measurementpoint mp, members_member m
        where mp.member_id = m.id
        ;
        `);
    sql.release();
    const rows = result?.rows;
    return rows;

};


export const getAverageMetrics = async (memberId: number, startDate: any, endDate: any) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
            select
                member.name,
                member.identifier as member_identifier,
                p.type as point_type,
                metercode.description as metric_name,
                m.timestamp::time as time,
                avg(m.value) * 4 as avg_value,
                'kW' as unit
            from metering_measurement m
            inner join members_measurementpoint p on p.id = m.measurement_point_id
            inner join public.members_member member on member.id = p.member_id
            inner join public.metering_metercode metercode on metercode.id = m.meter_code_id

            where member.identifier = $1
            and p.status like 'ACTIVE'
            and metercode.description not like 'Anteil gemeinschaftliche Erzeugung'
            and m.timestamp BETWEEN $2 AND $3
            group by member.name, member.identifier, p.type, metercode.description, m.timestamp::time
            order by m.timestamp::time
            ;
        `, [memberId, startDate, endDate]);

    sql.release();
    const rows = result?.rows;
    return rows;
};


export const getMetricTimestampRange = async (memberId: number) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
        select member.identifier, min(m.timestamp) as first_timestamp, max(m.timestamp) as last_timestamp,
            extract(YEAR FROM min(m.timestamp)) as first_year,
            extract(YEAR FROM max(m.timestamp)) as last_year,
            extract(MONTH FROM min(m.timestamp)) as first_month,
            extract(MONTH FROM max(m.timestamp)) as last_month
        from metering_measurement m
        inner join public.members_measurementpoint mp on mp.id = m.measurement_point_id
        inner join public.members_member member on member.id = mp.member_id
        where member.identifier = $1
        group by member.identifier;
        `, [memberId]);

    sql.release();
    const rows = result?.rows;

    if (rows.length == 1) {
        return rows[0];
    } else {
        return null;
    }

};


export const getMembers = async () => {
    const sql = await middlewareDbConnection();

    const result = await sql.query(`
        SELECT
            id,
            identifier,
            email,
            name,
            first_name AS "firstName",
            last_name AS "lastName",
            street,
            hnr,
            zip,
            city,
            latitude,
            longitude,
            TO_CHAR(member_since, 'YYYY-MM-DD') AS "memberSince"
        FROM members_member
        order by member_since desc;
    `);

    sql.release();

    return result?.rows;
};


export const getMember = async (identifier: number) => {
    const sql = await middlewareDbConnection();

    const result = await sql.query(`
        SELECT
            id,
            identifier,
            email,
            name,
            first_name AS "firstName",
            last_name AS "lastName",
            street,
            hnr,
            zip,
            city,
            latitude,
            longitude,
            TO_CHAR(member_since, 'YYYY-MM-DD') AS "memberSince"
        FROM members_member
        WHERE identifier = $1
        LIMIT 1;
    `, [identifier]);

    sql.release();

    return result?.rows?.[0] ?? null;
};