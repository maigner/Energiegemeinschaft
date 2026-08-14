<script>
    import { Button, Modal } from "flowbite-svelte";

    let { noDataModalOpen = $bindable(), onShowAll } = $props();
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
                noDataModalOpen = false;
                onShowAll?.();
            }}>Gesamten Zeitraum anzeigen</Button
        >
    {/snippet}
</Modal>
