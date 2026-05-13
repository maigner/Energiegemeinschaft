<script>
    import { formatDate, formatTime } from "$lib/format";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Card } from "flowbite-svelte";
    import { onMount } from "svelte";

    let { date, memberIdentifier, itemName } = $props();

    // $derive start and end timestamp for the given date

    let chartData = $state([]);

    const downsample = (data, intervalMinutes = 10) => {
        const intervalMs = intervalMinutes * 60 * 1000;
        let lastTime = null;
        return data.filter((item) => {
            const time = new Date(item.time).getTime();
            if (lastTime === null || time - lastTime >= intervalMs) {
                lastTime = time;
                return true;
            }
            return false;
        });
    };

    onMount(async () => {
        // load item data for debugging
        const res = await fetch(
            `/api/user/data/openhab/item?date=${date.toISOString()}&memberIdentifier=${memberIdentifier}&itemName=${encodeURIComponent(itemName)}`,
        );
        const data = await res.json();

        const reducedChartData = downsample(data, 15);

        chartData = reducedChartData;
    });

    let options = $derived({
        chart: {
            height: "400px",
            type: "area",
            fontFamily: "Inter, sans-serif",
            dropShadow: {
                enabled: false,
            },
            toolbar: {
                show: false,
            },
            zoom: {
                enabled: false,
            },
        },
        tooltip: {
            enabled: true,
            x: {
                show: false,
            },
        },
        fill: {
            type: "gradient",
            gradient: {
                opacityFrom: 0.55,
                opacityTo: 0,
                shade: "#1C64F2",
                gradientToColors: ["#1C64F2"],
            },
        },
        dataLabels: {
            enabled: true,
        },
        stroke: {
            width: 6,
        },
        grid: {
            show: false,
            strokeDashArray: 4,
            padding: {
                left: 2,
                right: 2,
                top: 0,
            },
        },
        series: [
            {
                name: itemName,
                data: chartData.map((e) => ({
                    x: new Date(e.time).getTime(), // timestamp in ms
                    y: parseFloat(e.value.toFixed(3)),
                })),

                color: "#F59E0B", // orange
            },
        ],
        xaxis: {
            type: "datetime",
            min: new Date(date).setHours(0, 0, 0, 0),
            max: new Date(date).setHours(23, 59, 59, 999),
            labels: {
                show: true,
                datetimeUTC: false, // use local time
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            show: false,
        },
    });
</script>

<Card class="p-4 md:p-6" size="xl">
    {date}
    <Chart {options} />
</Card>
