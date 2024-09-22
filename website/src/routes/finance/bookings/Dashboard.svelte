<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Badge, Indicator, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from "flowbite-svelte";

    export let data;

    $: bookingsByLabel = data.bookingsLabels.reduce((group, bookingLabel) => {
        const category = bookingLabel.label;
        if (!group[category]) {
            group[category] = [];
        }
        const bookingId = bookingLabel.booking_id;
        const booking = data.bookings.find(
            (booking) => booking.id === bookingId,
        );
        group[category].push(booking);
        return group;
    }, {});

    $: labelList = Object.keys(bookingsByLabel).map((label) => {
        return data.labels.find((l) => l.label === label);
    });




</script>


<Table class="mb-8">
    <TableHead>
        <TableHeadCell>Kategorie</TableHeadCell>
        <TableHeadCell>Summe</TableHeadCell>
        <TableHeadCell>Cash Flow</TableHeadCell>
    </TableHead>
    <TableBody tableBodyClass="divide-y">
        {#each labelList as label, index (label.id)}
            {@const bookings = bookingsByLabel[label.label]}
            <TableBodyRow>
                <TableBodyCell class="whitespace-normal p-2">
                    <Badge color={label.color} rounded class="px-2 py-1 m-1 relative">
                        <Indicator color={label.color} size="md" class="me-1" /><span
                            class="text-xs">{label.label}</span
                        >
                    </Badge>
                        
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal">
                    {bookings.reduce((sum, booking) => sum + parseFloat(booking.amount), 0).toFixed(2)}
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal">
                    {bookings.reduce((sum, booking) => sum + Math.abs(parseFloat(booking.amount)), 0).toFixed(2)}
                </TableBodyCell>
            </TableBodyRow>
        {/each}

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                
                <div class="pl-1 text-lg">Gesamt</div>
                    
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg">
                {data.bookings.reduce((sum, booking) => sum + parseFloat(booking.amount), 0).toFixed(2)}
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg">
                {data.bookings.reduce((sum, booking) => sum + Math.abs(parseFloat(booking.amount)), 0).toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>

    </TableBody>
</Table>

