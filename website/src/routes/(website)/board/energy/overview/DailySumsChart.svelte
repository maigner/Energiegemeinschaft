<script>
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card, Heading } from "flowbite-svelte";
    import { COLORS, baseOptions } from "./chartShared.js";

    /** @type {{ dailySums: any[] }} */
    let { dailySums } = $props();

    const ts = (/** @type {any} */ it) => new Date(it.day).getTime();
    const mwh = (/** @type {string} */ v) => parseFloat(v) / 1000.0;

    const lastDate = dailySums.length ? new Date(dailySums.at(-1).day) : null;

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
                data: dailySums.map((it) => [ts(it), mwh(it.self_use)]),
            },
            {
                name: "Verbrauch",
                type: "line",
                data: dailySums.map((it) => [ts(it), mwh(it.total_consumption)]),
            },
            {
                name: "Erzeugung",
                type: "line",
                data: dailySums.map((it) => [ts(it), mwh(it.total_production)]),
            },
        ],
        tooltip: {
            shared: true,
            intersect: false,
            x: { format: "dd. MMM yyyy" },
            y: {
                formatter: (/** @type {number} */ value) =>
                    `${value.toFixed(2)} MWh`,
            },
        },
        yaxis: {
            min: 0,
            forceNiceScale: true,
            title: {
                text: "MWh je Tag",
                style: { color: "#6b7280", fontWeight: 400 },
            },
            labels: {
                style: { colors: "#6b7280" },
                formatter: (/** @type {number} */ value) => value.toFixed(1),
            },
        },
    };
</script>

<Card class="p-4 md:p-6" size="xl">
    <div class="flex items-end justify-between mb-2">
        <Heading tag="h2" class="text-xl font-semibold w-auto">
            Letzte 30 Tage
        </Heading>
        {#if lastDate}
            <span class="text-xs text-gray-500 dark:text-gray-400">
                Stand: {lastDate.toLocaleDateString("de-AT", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                })}
            </span>
        {/if}
    </div>

    <Chart {options} />
</Card>
