import { middlewareDbConnection } from "$lib/server/db/db";


export const getWeeklySums = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
    select total_consumption.year, total_consumption.week,
       total_consumption.sum_in_kwh as total_consumption,
       production_share.sum_in_kwh as production_share,
       self_use.sum_in_kwh as self_use,
       total_production.sum_in_kwh as total_production,
       overshoot.sum_in_kwh as overshoot
    from
        (select year, week, sum_in_kwh, description from weekly_metering_summary where meter_code_id = 193) as total_consumption,
        (select year, week, sum_in_kwh, description from weekly_metering_summary where meter_code_id = 194) as production_share,
        (select year, week, sum_in_kwh, description from weekly_metering_summary where meter_code_id = 195) as self_use,
        (select year, week, sum_in_kwh, description from weekly_metering_summary where meter_code_id = 196) as total_production,
        (select year, week, sum_in_kwh, description from weekly_metering_summary where meter_code_id = 197) as overshoot

    where total_consumption.year = production_share.year and total_consumption.week = production_share.week
    and total_consumption.year = self_use.year and total_consumption.week = self_use.week
    and total_consumption.year = total_production.year and total_consumption.week = total_production.week
    and total_consumption.year = overshoot.year and total_consumption.week = overshoot.week
    order by year, week
    `);
    await sql.end();
    sql.release();
    return (result?.rows.length > 0 ? result?.rows : null);
};
