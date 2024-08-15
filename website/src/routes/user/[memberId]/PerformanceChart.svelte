<script>
    import {
        Chart,
        Card,
        Tabs,
        TabItem,
    } from "flowbite-svelte";
    
    import ChartHeader from "./ChartHeader.svelte";
    import { onMount } from "svelte";
    import DataRangePagination from "./DataRangePagination.svelte";
    import NoDataModal from "./NoDataModal.svelte";

    /**
     * @type {{ currentStartDate: any; metricsTimestampRange: { first_timestamp: any; last_timestamp: any; }; currentEndDate: any; user: { identifier: any; }; averageMetrics: any[]; dataRangeSelection: string; }}
     */
    export let data;

    let unit = "kW";

    let options = {
        chart: {
            height: "400px",
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
                formatter: (value) => {
                    return `${value.toFixed(1)} ${unit}`;
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

        xaxis: {
            type: "category",
            categories: [],
            labels: {
                show: false,
                style: {
                    fontSize: "14px",
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
                formatter: (value) => {
                    return value.toFixed(1);
                },
            },
        },
        legend: {
            fontSize: "18px",
            itemMargin: {
                vertical: 10,
            },
        },
    };

    /**
     * @type {any[]}
     */
    let labels = [];
    let labelMap = {};

    // metrics
    let prodTotal = [];

    let overshoot = [];

    let consumptionTotal = [];

    let eegReceive = [];
    // difference goes into EEG
    let eegInject = [];

    let producerGraphOptions = {
        series: [
            {
                name: "Netzeinspeisung",
                data: [],
                color: "#5dd602",
            },
            {
                name: "EEG Einspeisung",
                data: [],
                color: "#3bd2bd",
            },
        ],
        ...options,
    };

    let consumerGraphOptions = {
        series: [
            {
                name: "Netzbezug",
                data: [],
                color: "#de5213",
            },
            {
                name: "EEG Bezug",
                data: [],
                color: "#f5eb1e",
            },
        ],
        ...options,
    };

    data.currentStartDate = data.metricsTimestampRange.first_timestamp;
    data.currentEndDate = data.metricsTimestampRange.last_timestamp;

    const loadData = async (startDate, endDate) => {
        const response = await fetch("/api/user/data/averageMetrics", {
            method: "POST",
            body: JSON.stringify({
                userId: data.user.identifier,
                startDate,
                endDate,
            }),
            headers: {
                "content-type": "application/json",
            },
        });

        const result = await response.json();
        console.log(result);

        data.currentStartDate = startDate;
        data.currentEndDate = endDate;

        // data
        data.averageMetrics = result;

        // labels
        data.averageMetrics.forEach((element) => {
            if (!(element.time in labelMap)) {
                labels.push(element.time);
                labelMap[element.time] = true;
            }
        });

        // metrics
        prodTotal = data.averageMetrics
            .filter(
                (/** @type {{ metric_name: string; }} */ element) =>
                    element.metric_name ===
                    "Gesamte gemeinschaftliche Erzeugung",
            )
            .map(
                (/** @type {{ avg_value: number; }} */ element) =>
                    element.avg_value,
            );

        overshoot = data.averageMetrics
            .filter(
                (element) =>
                    element.metric_name ===
                    "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
            )
            .map((element) => element.avg_value);

        consumptionTotal = data.averageMetrics
            .filter(
                (element) =>
                    element.metric_name ===
                    "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)",
            )
            .map((element) => element.avg_value);

        eegReceive = data.averageMetrics
            .filter(
                (element) =>
                    element.metric_name ===
                    "Eigendeckung gemeinschaftliche Erzeugung",
            )
            .map((element) => element.avg_value);
        // difference goes into EEG
        eegInject = prodTotal.map((value, index) => {
            return value - overshoot[index];
        });

        producerGraphOptions = {
            series: [
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
            ...options,
        };

        consumerGraphOptions = {
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
            ],
            ...options,
        };
    };

    function addQuarters(date, n) {
        let newDate = new Date(date);

        // Calculate the new month by adding n quarters (n * 3 months)
        let newMonth = newDate.getMonth() + n * 3;

        // Set the new month, JavaScript will handle year rollover automatically
        newDate.setMonth(newMonth);

        return newDate;
    }

    function getQuarterDates(quarterOffset) {
        let now = new Date();

        now = addQuarters(now, quarterOffset);

        let currentMonth = now.getMonth(); // 0-based index (0 = January)

        // Determine the start and end month of the current quarter
        let startMonth = Math.floor(currentMonth / 3) * 3;
        let endMonth = startMonth + 2;

        // Create the start and end dates
        let startDate = new Date(now.getFullYear(), startMonth, 1);
        let endDate = new Date(now.getFullYear(), endMonth + 1, 0); // 0 gets the last day of the previous month

        return { startDate, endDate };
    }

    let currentDataRangeSelection = "";

    $: {
        console.log(data.dataRangeSelection);

        if (data.dataRangeSelection !== currentDataRangeSelection) {
            currentDataRangeSelection = data.dataRangeSelection;
            console.log("update");
            updateChart(data.dataRangeSelection);
            currentDataRangeSelection = data.dataRangeSelection;
        }
    }

    async function updateChart(dataRangeSelection) {
        //let d = await loadData(startDate, endDate);

        switch (dataRangeSelection) {
            case "Gesamt":
                console.log("reset do defaults");

                loadData(
                    data.metricsTimestampRange.first_timestamp,
                    data.metricsTimestampRange.last_timestamp,
                );

                break;
            case "Quartal":
                console.log("welches Quartal?");
                let quarterDates = getQuarterDates(-1);
                console.log(
                    "Start Date of the Quarter:",
                    quarterDates.startDate.toDateString(),
                ); // e.g., "Start Date of the Quarter: Sun Jan 01 2023"
                console.log(
                    "End Date of the Quarter:",
                    quarterDates.endDate.toDateString(),
                ); // e.g., "End Date of the Quarter: Fri Mar 31 2023"
                loadData(quarterDates.startDate, quarterDates.endDate);

                break;
            case "Halbjahr":
                console.log("welches Quartal?");
                break;
            case "Jahr":
                console.log("welches Quartal?");
                break;
        }
    }

    onMount(() => {
        data.dataRangeSelection = "Gesamt";
    });
</script>

<Card class="max-w-full">
    <DataRangePagination bind:data />
    
    {#if consumerGraphOptions.series[0].data.length === 0 && producerGraphOptions.series[0].data.length === 0}


        <NoDataModal bind:data />

    {/if}

    <Tabs>
        {#if consumptionTotal.length > 0}
            <TabItem open title="Bezug">
                <ChartHeader bind:data>
                    <span slot="title">&#x2300; Bezug nach Tageszeit</span>
                    <span slot="subTitle">in kiloWatt</span>
                </ChartHeader>

                <Chart options={consumerGraphOptions} />
            </TabItem>
        {/if}

        {#if prodTotal.length > 0}
            <TabItem open title="Einspeisung">
                <ChartHeader bind:data>
                    <span slot="title">&#x2300; Einspeisung nach Tageszeit</span
                    >
                    <span slot="subTitle">in kiloWatt</span>
                </ChartHeader>

                <Chart options={producerGraphOptions} />
            </TabItem>
        {/if}
    </Tabs>

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
