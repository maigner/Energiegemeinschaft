<script>
    import { Chart, Card, Tabs, TabItem } from "flowbite-svelte";

    import ChartHeader from "./ChartHeader.svelte";
    import { onMount } from "svelte";
    import DataRangePagination from "./DataRangePagination.svelte";
    import NoDataModal from "./NoDataModal.svelte";

    export let data;

    data.noDataModalOpen = false;

    let unit = "kW";

    data.currentStartDate = data.metricsTimestampRange.first_timestamp;
    data.currentEndDate = data.metricsTimestampRange.last_timestamp;

    data.dateSelectionOptions = [
        {
            name: "1. Quartal 2024",
            startDate: new Date("2024-01-01T00:00:00"),
            endDate: new Date("2024-03-30T23:59:59"),
        },
        {
            name: "2. Quartal 2024",
            startDate: new Date("2024-04-01T00:00:00"),
            endDate: new Date("2024-06-30T23:59:59"),
        },
        {
            name: "Gesamt",
            startDate: data.metricsTimestampRange.first_timestamp,
            endDate: data.metricsTimestampRange.last_timestamp,
        },
    ];

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
            categories: [
                "00:00:00",
                "00:15:00",
                "00:30:00",
                "00:45:00",
                "01:00:00",
                "01:15:00",
                "01:30:00",
                "01:45:00",
                "02:00:00",
                "02:15:00",
                "02:30:00",
                "02:45:00",
                "03:00:00",
                "03:15:00",
                "03:30:00",
                "03:45:00",
                "04:00:00",
                "04:15:00",
                "04:30:00",
                "04:45:00",
                "05:00:00",
                "05:15:00",
                "05:30:00",
                "05:45:00",
                "06:00:00",
                "06:15:00",
                "06:30:00",
                "06:45:00",
                "07:00:00",
                "07:15:00",
                "07:30:00",
                "07:45:00",
                "08:00:00",
                "08:15:00",
                "08:30:00",
                "08:45:00",
                "09:00:00",
                "09:15:00",
                "09:30:00",
                "09:45:00",
                "10:00:00",
                "10:15:00",
                "10:30:00",
                "10:45:00",
                "11:00:00",
                "11:15:00",
                "11:30:00",
                "11:45:00",
                "12:00:00",
                "12:15:00",
                "12:30:00",
                "12:45:00",
                "13:00:00",
                "13:15:00",
                "13:30:00",
                "13:45:00",
                "14:00:00",
                "14:15:00",
                "14:30:00",
                "14:45:00",
                "15:00:00",
                "15:15:00",
                "15:30:00",
                "15:45:00",
                "16:00:00",
                "16:15:00",
                "16:30:00",
                "16:45:00",
                "17:00:00",
                "17:15:00",
                "17:30:00",
                "17:45:00",
                "18:00:00",
                "18:15:00",
                "18:30:00",
                "18:45:00",
                "19:00:00",
                "19:15:00",
                "19:30:00",
                "19:45:00",
                "20:00:00",
                "20:15:00",
                "20:30:00",
                "20:45:00",
                "21:00:00",
                "21:15:00",
                "21:30:00",
                "21:45:00",
                "22:00:00",
                "22:15:00",
                "22:30:00",
                "22:45:00",
                "23:00:00",
                "23:15:00",
                "23:30:00",
                "23:45:00",
            ],
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

        if (data.averageMetrics.length < 1) {
            // no data
            console.log("No Data?");
            data.noDataModalOpen = true;
        }

        //options.labels = labels;

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

        checkDataSeries({ prodTotal });

        overshoot = data.averageMetrics
            .filter(
                (element) =>
                    element.metric_name ===
                    "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
            )
            .map((element) => element.avg_value);

        checkDataSeries({ overshoot });

        consumptionTotal = data.averageMetrics
            .filter(
                (element) =>
                    element.metric_name ===
                    "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)",
            )
            .map((element) => element.avg_value);
        checkDataSeries({ consumptionTotal });

        eegReceive = data.averageMetrics
            .filter(
                (element) =>
                    element.metric_name ===
                    "Eigendeckung gemeinschaftliche Erzeugung",
            )
            .map((element) => element.avg_value);

        checkDataSeries({ eegReceive });

        // difference goes into EEG
        eegInject = prodTotal.map((value, index) => {
            return value - overshoot[index];
        });

        checkDataSeries({ eegInject });

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

        console.log({ consumerGraphOptions });
    };

    function addQuarters(date, n) {
        let newDate = new Date(date);

        // Calculate the new month by adding n quarters (n * 3 months)
        let newMonth = newDate.getMonth() + n * 3;

        // Set the new month, JavaScript will handle year rollover automatically
        newDate.setMonth(newMonth);

        return newDate;
    }

    function addHalfYears(date, n) {
        let newDate = new Date(date);
        // Calculate the new month by adding n quarters (n * 3 months)
        let newMonth = newDate.getMonth() + n * 6;
        // Set the new month, JavaScript will handle year rollover automatically
        newDate.setMonth(newMonth);
        return newDate;
    }

    function addYears(date, n) {
        let newDate = new Date(date);
        // Calculate the new month by adding n quarters (n * 3 months)
        let newMonth = newDate.getMonth() + n * 12;
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

    function getHalfYearDates(halfYearOffset) {
        let now = new Date();

        now = addHalfYears(now, halfYearOffset);

        let currentMonth = now.getMonth(); // 0-based index (0 = January)

        // Determine the start and end month of the current quarter
        let startMonth = Math.floor(currentMonth / 6) * 6;
        let endMonth = startMonth + 5;

        // Create the start and end dates
        let startDate = new Date(now.getFullYear(), startMonth, 1);
        let endDate = new Date(now.getFullYear(), endMonth + 1, 0); // 0 gets the last day of the previous month

        return { startDate, endDate };
    }

    function getYearDates(yearOffset) {
        let now = new Date();

        now = addYears(now, yearOffset);

        // Determine the start and end month of the current quarter
        let startMonth = 0;
        let endMonth = 11;

        // Create the start and end dates
        let startDate = new Date(now.getFullYear(), startMonth, 1);
        let endDate = new Date(now.getFullYear(), endMonth + 1, 0); // 0 gets the last day of the previous month

        return { startDate, endDate };
    }

    let currentDataRangeSelection = {
        name: "",
    };
    $: {
        //console.log(data.dataRangeSelection);
        if (data.dataRangeSelection) {
            if (
                data.dataRangeSelection.name !== currentDataRangeSelection.name
            ) {
                currentDataRangeSelection = data.dataRangeSelection;
                console.log("update");
                updateChart(data.dataRangeSelection);
            }
        }
    }

    async function updateChart(dataRangeSelection) {
        console.log({ dataRangeSelection });
        loadData(dataRangeSelection.startDate, dataRangeSelection.endDate);
    }

    onMount(() => {
        data.dataRangeSelection = {
            name: "Gesamt",
            startDate: data.metricsTimestampRange.first_timestamp,
            endDate: data.metricsTimestampRange.last_timestamp,
        };
    });

    function checkDataSeries(series) {
        for (const seriesName in series) {
            //console.log({ seriesName });
            const list = series[seriesName];
            if (list.length < 1) {
                console.log(`${seriesName} empty`);
            }
            list.forEach((val) => {
                if (isNaN(val)) {
                    console.log({ val });
                }
            });
        }
    }

    let tabOpen = {
        production: false,
        consumption: true,
    };
    $: {
        if (prodTotal.length < 1 && consumptionTotal.length > 0) {
            tabOpen.production = false;
            tabOpen.consumption = true;
        }
        if (prodTotal.length > 1 && consumptionTotal.length < 0) {
            tabOpen.production = true;
            tabOpen.consumption = false;
        }
    }

</script>

<NoDataModal bind:data />


<Card class="max-w-full">
    <DataRangePagination bind:data />

    <Tabs>
        {#if consumptionTotal.length > 0}
            <TabItem bind:open={tabOpen.consumption} title="Bezug">
                <ChartHeader bind:data>
                    <span slot="title">&#x2300; Bezug nach Tageszeit</span>
                    <span slot="subTitle">in kiloWatt</span>
                </ChartHeader>

                <Chart bind:options={consumerGraphOptions} />
            </TabItem>
        {/if}

        {#if prodTotal.length > 0}
            <TabItem bind:open={tabOpen.production} title="Einspeisung">
                <ChartHeader bind:data>
                    <span slot="title">&#x2300; Einspeisung nach Tageszeit</span
                    >
                    <span slot="subTitle">in kiloWatt</span>
                </ChartHeader>

                <Chart bind:options={producerGraphOptions} />
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
{JSON.stringify(consumerGraphOptions.labels)}
