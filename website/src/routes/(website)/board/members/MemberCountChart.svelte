<script>
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card } from "flowbite-svelte";
    import deLocale from "apexcharts/dist/locales/de.json";

    /** @type {{ stats: { month: string | Date, num_members: string }[] }} */
    let { stats } = $props();

    // volle Tagesauflösung als [Zeitstempel, Anzahl]-Paare
    const points = stats.map((e) => [
        new Date(e.month).getTime(),
        parseInt(e.num_members),
    ]);

    const lastPoint = points.at(-1);
    const current = lastPoint?.[1] ?? 0;
    const lastDate = lastPoint ? new Date(lastPoint[0]) : null;

    // Zuwachs seit Jahresbeginn
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const atYearStart = points.filter((p) => p[0] <= yearStart).at(-1)?.[1];
    const delta = atYearStart != null ? current - atYearStart : null;

    const dateLabel = lastDate
        ? lastDate.toLocaleDateString("de-AT", {
              day: "2-digit",
              month: "long",
              year: "numeric",
          })
        : "";

    /** @type {import("apexcharts").ApexOptions} */
    const options = {
        chart: {
            height: "320px",
            type: "area",
            fontFamily: "Inter, sans-serif",
            locales: [deLocale],
            defaultLocale: "de",
            toolbar: { show: false },
            zoom: { enabled: false },
            animations: { enabled: false },
        },
        colors: ["#1A56DB"],
        stroke: { width: 2, curve: "stepline", lineCap: "round" },
        fill: { type: "solid", opacity: 0.1 },
        dataLabels: { enabled: false },
        grid: {
            show: true,
            borderColor: "rgba(107, 114, 128, 0.2)",
            strokeDashArray: 0,
            xaxis: { lines: { show: false } },
            yaxis: { lines: { show: true } },
        },
        tooltip: {
            x: { format: "dd. MMM yyyy" },
            y: {
                formatter: (/** @type {number} */ value) =>
                    `${value} Mitglieder`,
            },
        },
        series: [{ name: "Mitglieder", data: points }],
        xaxis: {
            type: "datetime",
            labels: {
                datetimeUTC: false,
                style: { colors: "#6b7280" },
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
            tooltip: { enabled: false },
        },
        yaxis: {
            min: 0,
            forceNiceScale: true,
            labels: {
                style: { colors: "#6b7280" },
                formatter: (/** @type {number} */ value) =>
                    String(Math.round(value)),
            },
        },
    };
</script>

<Card class="p-4 md:p-6" size="xl">
    <div class="flex items-end justify-between mb-2">
        <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
                Vereinsstärke
            </p>
            <p class="text-4xl font-semibold text-gray-900 dark:text-white">
                {current}
            </p>
        </div>
        <div class="text-right">
            {#if delta !== null && delta !== 0}
                <p
                    class="text-sm font-medium {delta > 0
                        ? 'text-green-700 dark:text-green-500'
                        : 'text-red-700 dark:text-red-500'}"
                >
                    {delta > 0 ? "+" : ""}{delta} seit Jahresbeginn
                </p>
            {/if}
            <p class="text-xs text-gray-500 dark:text-gray-400">
                Stand: {dateLabel}
            </p>
        </div>
    </div>

    <Chart {options} />
</Card>
