<script>
    import { formatDate, formatTime } from "$lib/format";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Heading } from "flowbite-svelte";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card, A, Button, Dropdown, DropdownItem } from "flowbite-svelte";
    import {
        ChevronRightOutline,
        ChevronDownOutline,
    } from "flowbite-svelte-icons";

    let { date, forecast } = $props();

    let options = {
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
                name: "°C",
                //data: [6500, 6418, 6456, 6526, 6356, 6456],
                data: forecast.map((e) => e.temperature_2m),
                color: "#1A56DB",
            },
        ],
        xaxis: {
            categories: forecast.map((e) => formatTime(e.time)),
            labels: {
                show: true,
            },
            axisBorder: {
                show: false,
            },
            axisTicks: {
                show: false,
            },
        },
        yaxis: {
            show: false,
        },
    };
</script>

<Card class="p-4 md:p-6">
    <div class="flex justify-between">
        <div>
            <h5
                class="pb-2 text-3xl leading-none font-bold text-gray-900 dark:text-white"
            >
                {Math.max(...forecast.map((e) => e.temperature_2m))}°C
            </h5>
            <p class="text-base font-normal text-gray-500 dark:text-gray-400">
                Tageshöchstwert
            </p>
        </div>
        <div
            class="flex items-center px-2.5 py-0.5 text-center text-base font-semibold text-green-500 dark:text-green-500"
        >
            {formatDate(date)}
        </div>
    </div>
    <Chart {options} />
</Card>
