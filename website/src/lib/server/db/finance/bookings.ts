import { middlewareDbPool } from "$lib/server/db/db";


export const getBookings = async () => {
    const result = await middlewareDbPool.query(`
        select
            *
        from accounting_booking
        order by booking_date desc
        `
    );

    // consider payment date. if payment date is set, the we override booking date and valuta date
    // used for credit card payments, when actual payment happens before credit card accounting
    // Assert: use the date, when the money is actually "gone"
    return result.rows.map(booking => ({
        ...booking,
        booking_date: booking.payment_date !== null ? booking.payment_date : booking.booking_date,
        value_date: booking.payment_date !== null ? booking.payment_date : booking.value_date,
    }));
};


export const getLabels = async () => {
    const result = await middlewareDbPool.query(`
        select
            *
        from accounting_bookinglabel
        order by accounting_bookinglabel.label
        `
    );

    return result.rows;
};


export const getBookingsLabels = async () => {
    const result = await middlewareDbPool.query(`
        select
            bl.booking_id, bl.bookinglabel_id as label_id, label.color, label.label
        from accounting_booking_labels bl
        inner join accounting_bookinglabel label on label.id = bl.bookinglabel_id
        `
    );

    return result.rows;
};


export const updateBookingReverseChargeAmount = async (bookingId: number, reverseChargeAmount: number | null) => {
    await middlewareDbPool.query(`
        UPDATE accounting_booking
        SET reverse_charge_amount = $1
        WHERE id = $2
        `,
        [reverseChargeAmount, bookingId]
    );
};

export const insertOrUpdateBookingLabel = async (bookingId: number, labelId: number) => {
    try {
        await middlewareDbPool.query(`
            INSERT INTO accounting_booking_labels (booking_id, bookinglabel_id)
            VALUES ($1, $2)
            ON CONFLICT (booking_id, bookinglabel_id)
            DO NOTHING;
            `,
            [bookingId, labelId]
        );

        const result = await middlewareDbPool.query(`
            select
                bl.booking_id, bl.bookinglabel_id as label_id, label.color, label.label
            from accounting_booking_labels bl
            inner join accounting_bookinglabel label on label.id = bl.bookinglabel_id
            where bl.booking_id = $1 and bl.bookinglabel_id = $2
            `,
            [bookingId, labelId]
        );

        return { success: true, message: 'Insert or update successful', data: result.rows[0] };
    } catch (error: any) {
        console.error('Error executing query', error.stack);
        return { success: false, message: 'Error executing query' };
    }
};


export const deleteBookingLabel = async (bookingId: number, labelId: number) => {
    try {
        await middlewareDbPool.query(`
            DELETE FROM accounting_booking_labels
            WHERE booking_id = $1 AND bookinglabel_id = $2;
            `,
            [bookingId, labelId]
        );

        return { success: true, message: 'Delete successful', data: null };
    } catch (error: any) {
        console.error('Error executing query', error.stack);
        return { success: false, message: 'Error executing query' };
    }
};


export const addFileToBooking = async (bookingId: number, filename: string) => {
    const result = await middlewareDbPool.query(`
        INSERT INTO accounting_bookingattachment (booking_id, filename)
        VALUES ($1, $2)
        RETURNING id
        `,
        [bookingId, filename]
    );

    return await getAttachment(result.rows[0].id);
};


export const deleteFileFromBooking = async (bookingId: number, filename: string) => {
    await middlewareDbPool.query(`
        DELETE FROM accounting_bookingattachment
        WHERE booking_id = $1 AND filename = $2
        `,
        [bookingId, filename]
    );
};

export const getBookingsAttachments = async () => {
    const result = await middlewareDbPool.query(`
        SELECT
            ba.booking_id,
            ba.id as attachment_id,
            ba.filename
        FROM accounting_bookingattachment ba
        `
    );

    return result.rows;
};


export const getAttachment = async (attachmentId: number) => {
    const result = await middlewareDbPool.query(`
        SELECT
            id, filename, booking_id
        FROM accounting_bookingattachment
        WHERE id = $1
        `,
        [attachmentId]
    );

    // Return the attachment if a result is found, otherwise undefined
    return result.rows[0];
};
