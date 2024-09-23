<script>
    import { formatDate } from "$lib/format";
    import { Button, Modal } from "flowbite-svelte";



    export let booking;
    /**
     * @type {boolean}
     */
     export let open;


</script>


<Modal title="Dateien" bind:open size="xl" autoclose>
    
    
    <iframe title="Buchung" src={`/finance/bookings/bookingFiles/${booking?.id}`} />
    <svelte:fragment slot="footer">
        <Button>OK</Button>
    </svelte:fragment>
</Modal>