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


export const getLabels = async () => {
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


export const getBookingsLabels = async () => {
    const sql = await middlewareDbConnection();

    const result = await sql.query(`
        select
            bl.booking_id, bl.bookinglabel_id as label_id, label.color, label.label
        from accounting_booking_labels bl
        inner join accounting_bookinglabel label on label.id = bl.bookinglabel_id
        `,
        []
    );

    await sql.end();
    sql.release();
    return result?.rows;
};


export const insertOrUpdateBookingLabel = async (bookingId: number, labelId: number) => {
    const sql = await middlewareDbConnection();

    let result;

    try {
        const query = `
            INSERT INTO accounting_booking_labels (booking_id, bookinglabel_id)
            VALUES ($1, $2)
            ON CONFLICT (booking_id, bookinglabel_id)
            DO NOTHING;
        `;

        // Execute the query
        await sql.query(query, [bookingId, labelId]);

        const result = await sql.query(`
            select
                bl.booking_id, bl.bookinglabel_id as label_id, label.color, label.label
            from accounting_booking_labels bl
            inner join accounting_bookinglabel label on label.id = bl.bookinglabel_id
            where bl.booking_id = $1 and bl.bookinglabel_id = $2
            `,
            [bookingId, labelId]
        );


        await sql.end();

        // Return a tuple with a success message and the inserted data
        return { success: true, message: 'Insert or update successful', data: result.rows[0] };
    } catch (error: any) {
        console.error('Error executing query', error.stack);

        // Return a tuple with an error message
        return { success: false, message: 'Error executing query', error: error.stack };
    } finally {
        sql.release(); // Release the client back to the pool
    }
};



export const deleteBookingLabel = async (bookingId: number, labelId: number) => {
    const sql = await middlewareDbConnection();

    console.log({bookingId, labelId});

    try {
        const query = `
            DELETE FROM accounting_booking_labels
            WHERE booking_id = $1 AND bookinglabel_id = $2;
        `;

        // Execute the query
        await sql.query(query, [bookingId, labelId]);

        
        // Return a tuple with a success message and the inserted data
        return { success: true, message: 'Delete successful', data: null };
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