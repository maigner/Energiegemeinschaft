<script>
    import { Button, Modal } from "flowbite-svelte";
    let defaultModal = true;
    export let data;
</script>


<Modal title="Leider keine Daten vorhanden" bind:open={defaultModal} autoclose>
    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Für diese Auswahl sind keine Daten vorhanden.
    </p>
    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Möglicherweise sind noch Datenlieferungen des Netzbetreibers ausständig.
    </p>
    
    <svelte:fragment slot="footer">
        <Button on:click={() => {
           data.dataRangeSelection = "Gesamt";
        } }>Zur Übersicht</Button>
    </svelte:fragment>
</Modal>
