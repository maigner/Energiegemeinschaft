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

    let relativeUseOfProduction = [];
    let relativeProvisionOfConsumption = [];

    // filter((_, index) => index % n === n - 1).

    data.weeklySums.forEach(
        (
            /** @type {{ week: any; total_consumption: string; total_production: string; self_use: string; }} */ it,
        ) => {
            //console.log(element.month);
            labels.push(`KW ${it.week}`);

            let relativeUse =
                (parseFloat(it.self_use) / parseFloat(it.total_production)) *
                100;
            let relativeProvision =
                (parseFloat(it.self_use) / parseFloat(it.total_consumption)) *
                100;

            // handle data > 100% due to measurement errors or other issues
            if (relativeUse > 100) {
                relativeUse = 100;
            }
            if (relativeProvision > 100) {
                relativeProvision = 100;
            }

            relativeUseOfProduction.push(relativeUse);
            relativeProvisionOfConsumption.push(relativeProvision);
        },
    );

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
                    return `${value.toFixed(2)} %`;
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
                name: "Deckung von Verbrauch durch Eigenproduktion",
                data: relativeProvisionOfConsumption,
                color: "#07831e", // Greenish
            },
            {
                name: "Eigenverbrauchsquote der Produktion",
                data: relativeUseOfProduction,
                color: "#FF6B35", // Orange
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
                text: "Verteilung [%]",
            },
        },
    };
</script>

<div class="w-full flex content-center flex-col">
    <Heading class="text-primary-700 text-center" tag="h6">Verteilung</Heading>
    <div class="mx-auto">
        <span class="text-xs">Stand: {labels[labels.length - 1]}</span>
    </div>

    <Chart class="m-4" bind:options />
</div>
