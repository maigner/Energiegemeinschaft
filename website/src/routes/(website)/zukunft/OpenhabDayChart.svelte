<script>
    import { formatDate, formatTime } from "$lib/format";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card } from "flowbite-svelte";
    import { onMount } from "svelte";


    let { date, memberId, itemName } = $props();

    // $derive start and end timestamp for the given date


    onMount(() => {

        //console.log("Forecast in DayChart:", forecast);

        // load item data for debugging


    });



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
                name: "Bewölkung %",
                //data: [6500, 6418, 6456, 6526, 6356, 6456],
                data: forecast.map((e) =>  e.cloud_cover.toFixed(1) ),
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

<Card class="p-4 md:p-6" size="xl">
{date}
    <Chart {options} />
</Card>
