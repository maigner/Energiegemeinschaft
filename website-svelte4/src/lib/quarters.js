
export function getQuarterRanges(startDate, endDate) {
    const quarters = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Normalize to beginning of the quarter
    let year = start.getFullYear();
    let quarter = Math.floor(start.getMonth() / 3) + 1;

    while (true) {
        const qStartMonth = (quarter - 1) * 3;
        const qStart = new Date(year, qStartMonth, 1, 0, 0, 0); // Local time start
        const qEnd = new Date(year, qStartMonth + 3, 0, 23, 59, 59, 999); // Local time end (last ms of last day)

        if (qStart > end) break;

        quarters.push({
            name: `${quarter}. Quartal ${year}`,
            startDate: qStart,
            endDate: qEnd
        });

        quarter++;
        if (quarter > 4) {
            quarter = 1;
            year++;
        }
    }

    return quarters;
}