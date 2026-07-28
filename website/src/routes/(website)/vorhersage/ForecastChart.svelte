<script>
    import { formatDate, formatTime } from "$lib/format";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card } from "flowbite-svelte";

    /** @type {{ hours: any[] }} */
    let { hours } = $props();

    const labels = hours.map(
        (e) => formatDate(new Date(e.hour)) + " " + formatTime(new Date(e.hour)),
    );

    // ApexCharts erwartet Zahlen, nicht formatierte Strings
    const round = (/** @type {number} */ value) => Math.round(Number(value ?? 0) * 10) / 10;

    /** @type {import("apexcharts").ApexOptions} */
    const options = {
        chart: {
            height: "400px",
            type: "line",
            fontFamily: "Inter, sans-serif",
            toolbar: { show: false },
            zoom: { enabled: false },
            animations: { enabled: false },
        },
        stroke: { width: 2, curve: "smooth" },
        dataLabels: { enabled: false },
        tooltip: { enabled: true, x: { show: true } },
        legend: { show: true, position: "top" },
        grid: { show: true, strokeDashArray: 4 },
        series: [
            {
                name: "Erzeugung",
                data: hours.map((e) => round(e.generation_kwh)),
                color: "#F59E0B",
            },
            {
                name: "Verbrauch",
                data: hours.map((e) => round(e.consumption_kwh)),
                color: "#1A56DB",
            },
            {
                name: "davon aus der Gemeinschaft",
                data: hours.map((e) => round(e.self_coverage_kwh)),
                color: "#16A34A",
            },
        ],
        xaxis: {
            categories: labels,
            tickAmount: 14,
            labels: { show: true, rotate: -45, hideOverlappingLabels: true },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            show: true,
            title: { text: "kWh je Stunde" },
            labels: { formatter: (/** @type {number} */ value) => String(Math.round(value)) },
        },
    };
</script>

<Card class="p-4 md:p-6" size="xl">
    <Chart {options} />
</Card>
