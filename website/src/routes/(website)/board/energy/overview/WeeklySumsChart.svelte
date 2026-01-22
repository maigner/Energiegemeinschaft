<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { format } from "date-fns";

    import { Heading } from "flowbite-svelte";
    import { Chart } from "flowbite-svelte";

    export let data;

    /**
     * @type {any[]}
     */
    let labels = [];
    /**
     * @type {number[]}
     */
    let totalConsumption = [];
    /**
     * @type {number[]}
     */
    let totalProduction = [];
    /**
     * @type {number[]}
     */
    let selfUse = [];

    // filter((_, index) => index % n === n - 1).

    data.weeklySums.forEach((/** @type {{ week: any; total_consumption: string; total_production: string; self_use: string; }} */ it) => {
        //console.log(element.month);
        labels.push(`KW ${it.week}`);
        totalConsumption.push(parseFloat(it.total_consumption) / 1000.0);
        totalProduction.push(parseFloat(it.total_production) / 1000.0);
        selfUse.push(parseFloat(it.self_use) / 1000.0);
    });

    // filter every nth element to smoothen chart
    /*
    const n = 1;
    // every nth and the last
    labels = [
        ...labels.filter((_, index) => index % n === n - 1),
        ...labels.slice(-1),
    ];

    totalConsumption = [
        ...totalConsumption.filter((_, index) => index % n === n - 1),
        ...totalConsumption.slice(-1),
    ];
    totalProduction = [
        ...totalProduction.filter((_, index) => index % n === n - 1),
        ...totalProduction.slice(-1),
    ];
    selfUse = [
        ...selfUse.filter((_, index) => index % n === n - 1),
        ...selfUse.slice(-1),
    ];
    
    // make sure to add the latest point. no worries about duplicates
*/

    let options = {
        chart: {
            height: "400px",
            maxWidth: "100%",
            type: "area",
            fontFamily: "Inter, sans-serif",
            dropShadow: {
                enabled: false,
            },
            zoom: {
                enabled: true, // Disables zooming
            },
            toolbar: {
                tools: {
                    zoom: true, // Hides zoom buttons
                    zoomin: true,
                    zoomout: true,
                    pan: true,
                    reset: true,
                },
            },
        },

        tooltip: {
            enabled: true,
            x: {
                show: false,
            },
            y: {
                formatter: function (/** @type {number} */ value) {
                    return `${value.toFixed(2)} MWh`; // Ensures tooltip also shows rounded values
                },
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
                name: "Verbrauch",
                data: totalConsumption,
                color: "#ed2a00",
            },
            {
                name: "Produktion",
                data: totalProduction,
                color: "#07831e",
            },
            {
                name: "Verteilt",
                data: selfUse,
                color: "#52cb24",
            },
        ],
        xaxis: {
            categories: labels,
            labels: {
                show: true,
            },
            axisBorder: {
                show: false,
            },
            axisTicks: {
                show: false,
            },
            title: {
                text: "Kalenderwoche",
            },
        },
        yaxis: {
            show: true,
            labels: {
                formatter: function (/** @type {number} */ value) {
                    return value.toFixed(0);
                },
            },
            title: {
                text: "Wochensumme [MWh]",
            },
        },
    };
</script>

<div class="w-full flex content-center flex-col">
    <Heading class="text-primary-700 text-center" tag="h6"
        >Entwicklung Energie</Heading
    >
    <div class="mx-auto">
        <span class="text-xs">Stand: {labels[labels.length - 1]}</span>
    </div>

    <Chart class="m-4" bind:options />
</div>
