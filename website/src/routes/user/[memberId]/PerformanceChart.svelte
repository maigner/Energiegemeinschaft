<script>
    import {
        Chart,
        Card,
        A,
        Button,
        Dropdown,
        DropdownItem,
    } from "flowbite-svelte";
    import {
        ChevronRightOutline,
        ChevronDownOutline,
    } from "flowbite-svelte-icons";
    import MonthSelector from "./MonthSelector.svelte";

    export let data;

    let unit = "kW";

    /**
     * @type {any[]}
     */
    let labels = [];
    let labelMap = {};

    // labels
    data.averageMetrics.forEach((element) => {
        if (!(element.time in labelMap)) {
            labels.push(element.time);
            labelMap[element.time] = true;
        }
    });

    // metrics
    let prodTotal = data.averageMetrics
        .filter(
            (/** @type {{ metric_name: string; }} */ element) =>
                element.metric_name === "Gesamte gemeinschaftliche Erzeugung",
        )
        .map((/** @type {{ avg_value: number; }} */ element) => element.avg_value);

    let overshoot = data.averageMetrics
        .filter(
            (element) =>
                element.metric_name ===
                "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
        )
        .map((element) => element.avg_value);

    let consumptionTotal = data.averageMetrics
        .filter(
            (element) =>
                element.metric_name ===
                "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)",
        )
        .map((element) => element.avg_value);

    let eegReceive = data.averageMetrics
        .filter(
            (element) =>
                element.metric_name ===
                "Eigendeckung gemeinschaftliche Erzeugung",
        )
        .map((element) => element.avg_value);
    // difference goes into EEG
    let eegInject = prodTotal.map((value, index) => {
        return value - overshoot[index];
    });

    let options = {
        chart: {
            height: "600px",
            maxWidth: "100%",
            type: "area",
            fontFamily: "Inter, sans-serif",
            dropShadow: {
                enabled: false,
            },
            toolbar: {
                show: false,
            },
        },
        tooltip: {
            enabled: true,
            x: {
                show: true,
                
            },
            y: {
                formatter: (value) => {return `${value.toFixed(1)} ${unit}`},
                
            }
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
                name: "Netzbezug",
                data: consumptionTotal,
                color: "#de5213",
            },
            {
                name: "EEG Bezug",
                data: eegReceive,
                color: "#f5eb1e",
            },

            {
                name: "Netzeinspeisung",
                data: overshoot,
                color: "#5dd602",
            },
            {
                name: "EEG Einspeisung",
                data: eegInject,
                color: "#3bd2bd",
            },
        ],
        xaxis: {
            type: "category",
            categories: labels,
            labels: {
                show: false,
                style: {
                    fontSize: '14px'
                },
                tickAmount: 24,
            },
            axisBorder: {
                show: false,
            },
            axisTicks: {
                show: false,
            },
        },
        yaxis: {
            show: true,
            labels: {
                formatter: (value) => { return value.toFixed(1)}
            }
        },
        legend: {
            fontSize: "18px",
            itemMargin: {
                vertical: 10
            }
        }
    };
</script>

<Card class="max-w-full">
    <div class="flex justify-between">
        <div>
            <h5
                class="leading-none text-3xl font-bold text-gray-900 dark:text-white pb-2"
            >
                &#x2300; Leistung nach Tageszeit
            </h5>
            <p class="text-base font-normal text-gray-500 dark:text-gray-400">
                in KiloWatt
            </p>
        </div>
        <div
            class="flex items-center px-2.5 py-0.5 text-base font-semibold text-green-500 dark:text-green-500 text-center"
        >
            
        <!--
            <MonthSelector bind:data />
            -->
        </div>
    </div>
    <Chart {options} />


    <!--
    
    <div
        class="grid grid-cols-1 items-center border-gray-200 border-t dark:border-gray-700 justify-between"
    >
        <div class="flex justify-between items-center pt-5">
            
            <A
                href="/"
                class="uppercase text-sm font-semibold hover:text-primary-700 dark:hover:text-primary-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:focus:ring-gray-700 dark:border-gray-700 px-3 py-2 hover:no-underline"
            >
                Users Report
                <ChevronRightOutline class="w-2.5 h-2.5 ms-1.5" />
            </A>
        </div>
    </div>
-->
</Card>
