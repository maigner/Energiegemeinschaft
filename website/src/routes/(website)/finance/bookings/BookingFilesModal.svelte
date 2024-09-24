<script>
    import { Button, Modal } from "flowbite-svelte";

    export let booking;
    /**
     * @type {boolean}
     */
    export let open;
</script>

<Modal title="Dateien hinzufügen" bind:open size="xl" autoclose class="">
    <div class="h-64">
        <iframe class="w-full h-full"
            title="Buchung"
            src={`/finance/bookings/bookingFiles/${booking?.id}`}
        />
    </div>
    <svelte:fragment slot="footer">
        <Button>OK</Button>
    </svelte:fragment>
</Modal>
