<script>
    import { Button, footer, Modal } from "flowbite-svelte";

    let { data, noDataModalOpen = $bindable() } = $props();

    $effect(() => {
        if (data.noDataModalOpen) {
            data.dataRangeSelection = {
                name: "Gesamt",
                startDate: data.metricsTimestampRange.first_timestamp,
                endDate: data.metricsTimestampRange.last_timestamp,
            };
        }
    });
</script>

<Modal title="Leider keine Daten vorhanden" bind:open={noDataModalOpen}>
    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Für diese Auswahl sind keine Daten vorhanden.
    </p>
    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Möglicherweise sind noch Datenlieferungen des Netzbetreibers ausständig.
    </p>

    {#snippet footer()}
        <Button
            onclick={() => {
                data.dataRangeSelection = {
                    name: "Gesamt",
                    startDate: data.metricsTimestampRange.first_timestamp,
                    endDate: data.metricsTimestampRange.last_timestamp,
                };

                noDataModalOpen = false;
            }}>Zur Übersicht</Button
        >
    {/snippet}
</Modal>
