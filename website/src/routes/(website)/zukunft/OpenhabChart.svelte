<script>
    import { formatDate, formatTime } from "$lib/format";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Card } from "flowbite-svelte";
    import { onMount } from "svelte";

    let {
        startDate,
        endDate,
        memberIdentifier,
        itemName,
        colour,
        ymin = undefined,
        ymax = undefined,
    } = $props();

    // $derive start and end timestamp for the given date

    let chartData = $state([]);

    const downsample = (data, intervalMinutes = 10) => {
        const intervalMs = intervalMinutes * 60 * 1000;
        let lastTime = null;
        return data.filter((item) => {
            const date = new Date(item.time);
            const time = date.getTime();
            const isFullHour =
                date.getMinutes() === 0 && date.getSeconds() === 0;

            if (
                isFullHour ||
                lastTime === null ||
                time - lastTime >= intervalMs
            ) {
                lastTime = time;
                return true;
            }
            return false;
        });
    };

    onMount(async () => {
        // load item data for debugging
        const res = await fetch(
            `/api/user/data/openhab/item?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&memberIdentifier=${memberIdentifier}&itemName=${encodeURIComponent(itemName)}`,
        );
        const data = await res.json();

        const reducedChartData = downsample(data, 60);

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
                show: true,
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
            enabled: false,
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
                data: chartData.map((e) => parseFloat(e.value.toFixed(1))),
                color: colour || "#F59E0B",
            },
        ],
        xaxis: {
            categories: chartData.map(
                (e) =>
                    formatDate(new Date(e.time)) +
                    " " +
                    formatTime(new Date(e.time)),
            ),
            labels: {
                show: true,
                rotate: -45,
                rotateAlways: true,
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            show: true,
            min: ymin !== undefined ? ymin : undefined,
            max: ymax !== undefined ? ymax : undefined,
        },
    });
</script>

<Card class="p-4 md:p-6" size="xl">
    {itemName}
    <Chart {options} />
</Card>
