<script>
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card, Heading } from "flowbite-svelte";
    import { getISOWeek, getISOWeekYear } from "date-fns";
    import { COLORS, baseOptions, isoWeekStart } from "./chartShared.js";

    /** @type {{ weeklySums: any[] }} */
    let { weeklySums } = $props();

    const ts = (/** @type {any} */ it) =>
        isoWeekStart(parseInt(it.year), parseInt(it.week));

    // Messfehler können Quoten über 100 % erzeugen – auf 100 % kappen
    const pct = (/** @type {number} */ share, /** @type {string} */ total) =>
        Math.min((share / parseFloat(total)) * 100, 100);

    const kwLabel = (/** @type {number} */ value) =>
        `KW ${getISOWeek(value)} / ${getISOWeekYear(value)}`;

    const lastTs = weeklySums.length ? ts(weeklySums.at(-1)) : null;

    /** @type {import("apexcharts").ApexOptions} */
    const options = {
        ...baseOptions(),
        colors: [COLORS.consumption, COLORS.production],
        series: [
            {
                name: "Verbrauch aus der EEG gedeckt",
                data: weeklySums.map((it) => [
                    ts(it),
                    pct(parseFloat(it.self_use), it.total_consumption),
                ]),
            },
            {
                name: "Erzeugung in der EEG verteilt",
                data: weeklySums.map((it) => [
                    ts(it),
                    pct(parseFloat(it.self_use), it.total_production),
                ]),
            },
        ],
        tooltip: {
            shared: true,
            intersect: false,
            x: { formatter: kwLabel },
            y: {
                formatter: (/** @type {number} */ value) =>
                    `${value.toFixed(1)} %`,
            },
        },
        yaxis: {
            min: 0,
            max: 100,
            tickAmount: 5,
            labels: {
                style: { colors: "#6b7280" },
                formatter: (/** @type {number} */ value) =>
                    `${value.toFixed(0)} %`,
            },
        },
    };
</script>

<Card class="p-4 md:p-6" size="xl">
    <div class="flex items-end justify-between mb-2">
        <div>
            <Heading tag="h2" class="text-xl font-semibold w-auto">
                Deckungsgrad
            </Heading>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                Wie viel des Verbrauchs die Gemeinschaft deckt – und wie viel
                der Erzeugung in der Gemeinschaft bleibt
            </p>
        </div>
        {#if lastTs}
            <span class="text-xs text-gray-500 dark:text-gray-400">
                Stand: {kwLabel(lastTs)}
            </span>
        {/if}
    </div>

    <Chart {options} />
</Card>
