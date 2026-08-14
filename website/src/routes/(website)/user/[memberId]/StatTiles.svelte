<script>
    // Kopfzahlen über dem Chart: beantworten die Grundfragen
    // "Wie viel habe ich verbraucht/erzeugt und was davon lief über die
    // Gemeinschaft?" ohne dass man die Kurve lesen muss
    let { totals, metricNames, communityColor } = $props();

    const formatKwh = (/** @type {number} */ value) =>
        `${Math.round(value).toLocaleString("de-AT")} kWh`;

    const formatShare = (
        /** @type {number} */ part,
        /** @type {number} */ total,
    ) => (total > 0 ? `${Math.round((part / total) * 100)} %` : "");

    let consumption = $derived(totals[metricNames.consumptionTotal]);
    let communityReceived = $derived(totals[metricNames.communityReceived]);
    let production = $derived(totals[metricNames.productionTotal]);
    let gridInjection = $derived(totals[metricNames.gridInjection]);
    let communityDelivered = $derived(
        production !== undefined && gridInjection !== undefined
            ? production - gridInjection
            : undefined,
    );

    let tiles = $derived.by(() => {
        /** @type {{ label: string; value: string; detail: string; detailSuffix?: string; }[]} */
        const result = [];
        if (consumption !== undefined) {
            result.push({
                label: "Verbrauch gesamt",
                value: formatKwh(consumption),
                detail: "",
            });
            if (communityReceived !== undefined) {
                result.push({
                    label: "Davon aus der Gemeinschaft",
                    value: formatKwh(communityReceived),
                    detail: formatShare(communityReceived, consumption),
                    detailSuffix: "des Verbrauchs",
                });
            }
        }
        if (production !== undefined) {
            result.push({
                label: "Erzeugung gesamt",
                value: formatKwh(production),
                detail: "",
            });
            if (communityDelivered !== undefined) {
                result.push({
                    label: "An die Gemeinschaft geliefert",
                    value: formatKwh(communityDelivered),
                    detail: formatShare(communityDelivered, production),
                    detailSuffix: "der Erzeugung",
                });
            }
        }
        return result;
    });
</script>

{#if tiles.length > 0}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        {#each tiles as tile}
            <div
                class="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
            >
                <p class="text-xs text-gray-500 dark:text-gray-400">
                    {tile.label}
                </p>
                <p
                    class="text-xl font-bold text-gray-900 dark:text-white mt-1 whitespace-nowrap"
                >
                    {tile.value}
                </p>
                {#if tile.detail}
                    <p
                        class="text-sm font-semibold mt-0.5 text-gray-900 dark:text-white"
                    >
                        <span
                            class="inline-block w-2 h-2 rounded-full mr-1"
                            style={`background-color: ${communityColor}`}
                        ></span>{tile.detail}
                        <span
                            class="font-normal text-gray-500 dark:text-gray-400"
                            >{tile.detailSuffix}</span
                        >
                    </p>
                {/if}
            </div>
        {/each}
    </div>
{/if}
