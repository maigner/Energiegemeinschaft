import { middlewareDbConnection } from "$lib/server/db/db";


export const getBookings = async (startDate: Date, endDate: Date) => {
    const sql = await middlewareDbConnection();

    const result = await sql.query(`
        select
            *
        from accounting_booking
        where booking_date between $1 and $2
        order by booking_date desc
        `,
        [startDate, endDate]
    );

    await sql.end();
    sql.release();

    console.log(result.rows);

    return result?.rows;
};


export const test = async () => {
    const sql = await middlewareDbConnection();

    const result = await sql.query(`
        select now()`,
        []
    );

    await sql.end();
    sql.release();

    console.log(result.rows);

    return result?.rows;
};