<script>
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card, Heading } from "flowbite-svelte";
    import { getISOWeek, getISOWeekYear } from "date-fns";
    import { COLORS, baseOptions, isoWeekStart } from "./chartShared.js";

    /** @type {{ weeklySums: any[] }} */
    let { weeklySums } = $props();

    const ts = (/** @type {any} */ it) =>
        isoWeekStart(parseInt(it.year), parseInt(it.week));
    const mwh = (/** @type {string} */ v) => parseFloat(v) / 1000.0;

    const kwLabel = (/** @type {number} */ value) =>
        `KW ${getISOWeek(value)} / ${getISOWeekYear(value)}`;

    const lastTs = weeklySums.length ? ts(weeklySums.at(-1)) : null;

    /** @type {import("apexcharts").ApexOptions} */
    const options = {
        ...baseOptions(),
        colors: [COLORS.community, COLORS.consumption, COLORS.production],
        // "Verteilt" als Fläche: Teilmenge von Verbrauch und Erzeugung
        fill: { type: "solid", opacity: [0.12, 1, 1] },
        series: [
            {
                name: "Verteilt",
                type: "area",
                data: weeklySums.map((it) => [ts(it), mwh(it.self_use)]),
            },
            {
                name: "Verbrauch",
                type: "line",
                data: weeklySums.map((it) => [
                    ts(it),
                    mwh(it.total_consumption),
                ]),
            },
            {
                name: "Erzeugung",
                type: "line",
                data: weeklySums.map((it) => [
                    ts(it),
                    mwh(it.total_production),
                ]),
            },
        ],
        tooltip: {
            shared: true,
            intersect: false,
            x: { formatter: kwLabel },
            y: {
                formatter: (/** @type {number} */ value) =>
                    `${value.toFixed(2)} MWh`,
            },
        },
        yaxis: {
            min: 0,
            forceNiceScale: true,
            title: {
                text: "MWh je Woche",
                style: { color: "#6b7280", fontWeight: 400 },
            },
            labels: {
                style: { colors: "#6b7280" },
                formatter: (/** @type {number} */ value) => value.toFixed(0),
            },
        },
    };
</script>

<Card class="p-4 md:p-6" size="xl">
    <div class="flex items-end justify-between mb-2">
        <Heading tag="h2" class="text-xl font-semibold w-auto">
            Wochensummen
        </Heading>
        {#if lastTs}
            <span class="text-xs text-gray-500 dark:text-gray-400">
                Stand: {kwLabel(lastTs)}
            </span>
        {/if}
    </div>

    <Chart {options} />
</Card>
