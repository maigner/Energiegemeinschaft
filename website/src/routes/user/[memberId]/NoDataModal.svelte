<script>
    import { Button, Modal } from "flowbite-svelte";

    export let data;

    $: {
        if (data.noDataModalOpen) {
            data.dataRangeSelection = {
                name: "Gesamt",
                startDate: data.metricsTimestampRange.first_timestamp,
                endDate: data.metricsTimestampRange.last_timestamp,
            };
        }
    }
</script>

<Modal title="Leider keine Daten vorhanden" bind:open={data.noDataModalOpen}>
    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Für diese Auswahl sind keine Daten vorhanden.
    </p>
    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Möglicherweise sind noch Datenlieferungen des Netzbetreibers ausständig.
    </p>

    <svelte:fragment slot="footer">
        <Button
            on:click={() => {
                data.dataRangeSelection = {
                    name: "Gesamt",
                    startDate: data.metricsTimestampRange.first_timestamp,
                    endDate: data.metricsTimestampRange.last_timestamp,
                };

                data.noDataModalOpen = false;
            }}>Zur Übersicht</Button
        >
    </svelte:fragment>
</Modal>
