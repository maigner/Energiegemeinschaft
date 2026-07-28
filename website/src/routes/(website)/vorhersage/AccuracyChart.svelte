<script>
    import { formatDate } from "$lib/format";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card } from "flowbite-svelte";

    /** @type {{ accuracy: any[] }} */
    let { accuracy } = $props();

    const labels = accuracy.map((e) => formatDate(new Date(e.day)));
    // ApexCharts erwartet Zahlen, nicht formatierte Strings
    const round = (/** @type {number} */ value) => Math.round(Number(value ?? 0));

    /** @type {import("apexcharts").ApexOptions} */
    const options = {
        chart: {
            height: "320px",
            type: "bar",
            fontFamily: "Inter, sans-serif",
            toolbar: { show: false },
            animations: { enabled: false },
        },
        plotOptions: { bar: { columnWidth: "70%" } },
        dataLabels: { enabled: false },
        legend: { show: true, position: "top" },
        grid: { show: true, strokeDashArray: 4 },
        series: [
            {
                name: "Verbrauch Prognose",
                data: accuracy.map((e) => round(e.consumption_forecast)),
                color: "#93C5FD",
            },
            {
                name: "Verbrauch gemessen",
                data: accuracy.map((e) => round(e.consumption_actual)),
                color: "#1A56DB",
            },
            {
                name: "Erzeugung Prognose",
                data: accuracy.map((e) => round(e.generation_forecast)),
                color: "#FCD34D",
            },
            {
                name: "Erzeugung gemessen",
                data: accuracy.map((e) => round(e.generation_actual)),
                color: "#F59E0B",
            },
        ],
        xaxis: {
            categories: labels,
            labels: { show: true, rotate: -45, hideOverlappingLabels: true },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            show: true,
            title: { text: "kWh je Tag" },
            labels: { formatter: (/** @type {number} */ value) => String(Math.round(value)) },
        },
    };
</script>

<Card class="p-4 md:p-6" size="xl">
    <Chart {options} />
</Card>
