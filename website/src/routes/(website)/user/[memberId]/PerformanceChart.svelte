<script>
    import { Chart, Card, Tabs, TabItem, Spinner, Alert } from "flowbite-svelte";

    import ChartHeader from "./ChartHeader.svelte";
    import DataRangePagination from "./DataRangePagination.svelte";
    import NoDataModal from "./NoDataModal.svelte";
    import StatTiles from "./StatTiles.svelte";
    import { getQuarterRanges } from "$lib/quarters";

    /**
     * @type {any}
     */
    let { data } = $props();

    let noDataModalOpen = $state(false);
    let currentStartDate = $state(new Date());
    let currentEndDate = $state(new Date());

    let unit = "kW";

    // Metrik-Namen aus der Datenlieferung (EEG-Faktura); die Anzeigenamen
    // in den Charts sind bewusst allgemeinverständlich gehalten
    const METRIC_CONSUMPTION_TOTAL =
        "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)";
    const METRIC_COMMUNITY_RECEIVED = "Eigendeckung gemeinschaftliche Erzeugung";
    const METRIC_PRODUCTION_TOTAL = "Gesamte gemeinschaftliche Erzeugung";
    const METRIC_GRID_INJECTION =
        "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss";

    // Serienfarben (validierte Palette): Gemeinschaftsanteil in beiden
    // Charts dieselbe Farbe, damit "Gemeinschaft" wiedererkennbar bleibt
    const COLOR_TOTAL = "#2a78d6";
    const COLOR_COMMUNITY = "#1baf7a";
    const COLOR_GRID = "#eb6834";

    /** @type {{ name: string; startDate: Date; endDate: Date; }[]} */
    let dateSelectionOptions = $state([]);

    if (data.metricsTimestampRange) {
        dateSelectionOptions = getQuarterRanges(
            data.metricsTimestampRange.first_timestamp,
            data.metricsTimestampRange.last_timestamp,
        );

        dateSelectionOptions.push({
            name: "Gesamter Zeitraum",
            startDate: data.metricsTimestampRange.first_timestamp,
            endDate: data.metricsTimestampRange.last_timestamp,
        });

        currentStartDate = data.metricsTimestampRange.first_timestamp;
        currentEndDate = data.metricsTimestampRange.last_timestamp;
    }

    /** @type {string[]} */
    const quarterHours = [];
    for (let hour = 0; hour < 24; hour++) {
        for (let minute = 0; minute < 60; minute += 15) {
            quarterHours.push(
                `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
            );
        }
    }

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
            zoom: {
                enabled: false,
            },
        },
        tooltip: {
            enabled: true,
            x: {
                show: true,
                formatter: (
                    /** @type {any} */ _value,
                    /** @type {any} */ { dataPointIndex },
                ) => {
                    const time = quarterHours[dataPointIndex] ?? "";
                    return `${time.substring(0, 5)} Uhr`;
                },
            },
            y: {
                formatter: (/** @type {number} */ value) => {
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
            width: 3,
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
            categories: quarterHours,
            labels: {
                // Uhrzeit alle drei Stunden anzeigen, dazwischen leer
                show: true,
                rotate: 0,
                hideOverlappingLabels: false,
                style: {
                    fontSize: "12px",
                },
                formatter: (/** @type {string} */ value) => {
                    if (!value) return "";
                    const [hour, minute] = value.split(":");
                    return minute === "00" && parseInt(hour) % 3 === 0
                        ? `${hour}:00`
                        : "";
                },
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
                formatter: (/** @type {number} */ value) => {
                    return value.toFixed(1);
                },
            },
        },
        legend: {
            show: true,
            fontSize: "14px",
            itemMargin: {
                vertical: 10,
            },
        },
    };

    // metrics
    /** @type {number[]} */
    let prodTotal = $state([]);

    /**
     * @type {any[]}
     */
    let overshoot = [];

    /** @type {number[]} */
    let consumptionTotal = $state([]);

    let eegReceive = [];
    // difference goes into EEG
    let eegInject = [];

    /** @type {Record<string, number>} */
    let totals = $state({});

    /** @type {import('apexcharts').ApexOptions} */
    // @ts-ignore
    let producerGraphOptions = $state({ series: [], ...options });

    /** @type {import('apexcharts').ApexOptions} */
    // @ts-ignore
    let consumerGraphOptions = $state({ series: [], ...options });

    let isLoading = $state(false);

    /** @type {'consumption' | 'production' | null} */
    let initialTab = $state(null);

    const loadData = async (
        /** @type {Date} */ startDate,
        /** @type {Date} */ endDate,
    ) => {
        isLoading = true;
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

        currentStartDate = startDate;
        currentEndDate = endDate;

        // data
        data.averageMetrics = result.averageMetrics ?? [];

        totals = Object.fromEntries(
            (result.totals ?? []).map(
                (/** @type {{ metric_name: string; total_kwh: any; }} */ row) => [
                    row.metric_name,
                    Number(row.total_kwh),
                ],
            ),
        );

        if (data.averageMetrics.length < 1) {
            // keine Daten für diese Auswahl -> Hinweis anzeigen
            noDataModalOpen = true;
        }

        const metricValues = (/** @type {string} */ metricName) =>
            data.averageMetrics
                .filter(
                    (/** @type {{ metric_name: string; }} */ element) =>
                        element.metric_name === metricName,
                )
                .map(
                    (/** @type {{ avg_value: number; }} */ element) =>
                        element.avg_value,
                );

        // metrics
        prodTotal = metricValues(METRIC_PRODUCTION_TOTAL);
        overshoot = metricValues(METRIC_GRID_INJECTION);
        consumptionTotal = metricValues(METRIC_CONSUMPTION_TOTAL);
        eegReceive = metricValues(METRIC_COMMUNITY_RECEIVED);

        // difference goes into EEG
        eegInject = prodTotal.map(
            (/** @type {number} */ value, /** @type {number} */ index) => {
                return value - overshoot[index];
            },
        );

        // @ts-ignore
        producerGraphOptions = {
            series: [
                {
                    name: "An die Gemeinschaft geliefert",
                    data: eegInject,
                    color: COLOR_COMMUNITY,
                },
                {
                    name: "Ins Stromnetz eingespeist",
                    data: overshoot,
                    color: COLOR_GRID,
                },
            ],
            ...options,
        };

        // @ts-ignore
        consumerGraphOptions = {
            series: [
                {
                    name: "Verbrauch gesamt",
                    data: consumptionTotal,
                    color: COLOR_TOTAL,
                },
                {
                    name: "Davon aus der Gemeinschaft",
                    data: eegReceive,
                    color: COLOR_COMMUNITY,
                },
            ],
            ...options,
        };

        if (initialTab === null) {
            if (consumptionTotal.length > 0) {
                initialTab = "consumption";
            } else if (prodTotal.length > 0) {
                initialTab = "production";
            }
        }

        isLoading = false;
    };

    let currentDataRangeSelection = $state({
        name: "",
    });

    $effect(() => {
        if (dataRangeSelection) {
            if (dataRangeSelection.name !== currentDataRangeSelection.name) {
                currentDataRangeSelection = dataRangeSelection;
                loadData(
                    dataRangeSelection.startDate,
                    dataRangeSelection.endDate,
                );
            }
        }
    });

    let dataRangeSelection = $state({
        name: "Gesamter Zeitraum",
        startDate: data.metricsTimestampRange?.first_timestamp,
        endDate: data.metricsTimestampRange?.last_timestamp,
    });

    const showFullRange = () => {
        const fullRange =
            dateSelectionOptions[dateSelectionOptions.length - 1];
        if (fullRange) {
            dataRangeSelection = fullRange;
        }
    };
</script>

{#if !data.metricsTimestampRange}
    <Card class="max-w-full mt-4">
        <Alert color="blue" class="text-base">
            <span class="font-semibold">Noch keine Energiedaten vorhanden.</span>
            Ihre Messwerte kommen vom Netzbetreiber und stehen meist erst einige
            Wochen nach der Aktivierung Ihres Zählpunkts zur Verfügung. Sie
            müssen nichts weiter tun &ndash; schauen Sie einfach später wieder
            vorbei.
        </Alert>
    </Card>
{:else}
    <NoDataModal bind:noDataModalOpen onShowAll={showFullRange} />

    <Card class="max-w-full mt-4">
        <DataRangePagination
            options={dateSelectionOptions}
            bind:dataRangeSelection
            {currentStartDate}
            {currentEndDate}
        />

        <StatTiles
            {totals}
            metricNames={{
                consumptionTotal: METRIC_CONSUMPTION_TOTAL,
                communityReceived: METRIC_COMMUNITY_RECEIVED,
                productionTotal: METRIC_PRODUCTION_TOTAL,
                gridInjection: METRIC_GRID_INJECTION,
            }}
            communityColor={COLOR_COMMUNITY}
        />

        {#if isLoading}
            <div class="w-max m-auto">
                <Spinner />
            </div>
        {/if}

        <Tabs>
            {#if consumptionTotal.length > 0}
                <TabItem
                    open={initialTab === "consumption"}
                    title="Mein Verbrauch"
                >
                    <ChartHeader
                        options={dateSelectionOptions}
                        bind:dataRangeSelection
                        title="Mein Verbrauch im Tagesverlauf"
                        subTitle="Durchschnittlicher Tag im gewählten Zeitraum, in Kilowatt (kW)"
                        hint="Jeder Punkt der Kurve zeigt, wie viel Strom Sie zu dieser Uhrzeit im Durchschnitt verbraucht haben &ndash; und wie viel davon aus der Energiegemeinschaft kam."
                    ></ChartHeader>

                    {#if !isLoading}
                        <Chart options={consumerGraphOptions} />
                    {:else}
                        <div class="w-max m-auto">
                            <Spinner />
                        </div>
                    {/if}
                </TabItem>
            {/if}

            {#if prodTotal.length > 0}
                <TabItem
                    open={initialTab === "production"}
                    title="Meine Erzeugung"
                >
                    <ChartHeader
                        options={dateSelectionOptions}
                        bind:dataRangeSelection
                        title="Meine Erzeugung im Tagesverlauf"
                        subTitle="Durchschnittlicher Tag im gewählten Zeitraum, in Kilowatt (kW)"
                        hint="Jeder Punkt der Kurve zeigt, wie viel Strom Ihre Anlage zu dieser Uhrzeit im Durchschnitt geliefert hat &ndash; an die Gemeinschaft oder ins Stromnetz."
                    ></ChartHeader>
                    {#if !isLoading}
                        <Chart options={producerGraphOptions} />
                    {:else}
                        <div class="w-max m-auto">
                            <Spinner />
                        </div>
                    {/if}
                </TabItem>
            {/if}
        </Tabs>

        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Datenbasis: vollständig vom Netzbetreiber gelieferte Tage im
            gewählten Zeitraum.
        </p>
    </Card>
{/if}
