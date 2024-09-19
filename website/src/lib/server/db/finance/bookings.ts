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

    //console.log(result.rows);

    return result?.rows;
};


export const getBookingLabels = async () => {
    const sql = await middlewareDbConnection();

    const result = await sql.query(`
        select
            *
        from accounting_bookinglabel
        order by accounting_bookinglabel.label
        `,
        []
    );

    await sql.end();
    sql.release();
    return result?.rows;
};


export const insertOrUpdateBookingLabel = async (bookingId: number, labelId: number) => {
    const sql = await middlewareDbConnection();

    try {
        const query = `
          INSERT INTO accounting_booking_labels (booking_id, bookinglabel_id)
          VALUES ($1, $2)
          ON CONFLICT (booking_id, bookinglabel_id)
          DO NOTHING;
        `;

        // Execute the query
        await sql.query(query, [bookingId, labelId]);

        // Return a tuple with a success message and the inserted data
        return { success: true, message: 'Insert or update successful', data: { bookingId, labelId } };
    } catch (error: any) {
        console.error('Error executing query', error.stack);

        // Return a tuple with an error message
        return { success: false, message: 'Error executing query', error: error.stack };
    } finally {
        sql.release(); // Release the client back to the pool
    }
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