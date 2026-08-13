import deLocale from "apexcharts/dist/locales/de.json";

// Farben je Größe – gleiche Zuordnung wie auf /vorhersage:
// Verbrauch blau, Erzeugung amber, in der Gemeinschaft verteilt grün
export const COLORS = {
    consumption: "#1A56DB",
    production: "#D97706",
    community: "#16A34A",
};

/** Montag der ISO-Kalenderwoche als Zeitstempel */
export const isoWeekStart = (
    /** @type {number} */ year,
    /** @type {number} */ week,
) => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const weekday = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - weekday + 1 + (week - 1) * 7);
    return monday.getTime();
};

/** @returns {import("apexcharts").ApexOptions} */
export const baseOptions = () => ({
    chart: {
        height: "340px",
        type: "line",
        fontFamily: "Inter, sans-serif",
        locales: [deLocale],
        defaultLocale: "de",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
    },
    stroke: { width: 2, curve: "straight", lineCap: "round" },
    dataLabels: { enabled: false },
    legend: {
        show: true,
        position: "top",
        horizontalAlign: "left",
        labels: { colors: "#6b7280" },
    },
    grid: {
        show: true,
        borderColor: "rgba(107, 114, 128, 0.2)",
        strokeDashArray: 0,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
    },
    xaxis: {
        type: "datetime",
        labels: { datetimeUTC: false, style: { colors: "#6b7280" } },
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
    },
});
