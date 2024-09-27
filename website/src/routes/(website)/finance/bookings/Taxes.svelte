<script>
    import {
        Badge,
        Indicator,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
        Heading,
    } from "flowbite-svelte";

    export let data;

    $: bookingsByLabel = data.bookingsLabels.reduce(
        (
            /** @type {{ [x: string]: any[]; }} */ group,
            /** @type {{ booking_id: any; label: any; }} */ bookingLabel,
        ) => {
            const bookingId = bookingLabel.booking_id;

            // only filtered bookings
            const booking = data.filteredBookings.find(
                (/** @type {{ id: number; }} */ booking) =>
                    booking.id === bookingId,
            );
            if (!booking) return group;

            const category = bookingLabel.label;
            if (!group[category]) {
                group[category] = [];
            }
            group[category].push(booking);
            return group;
        },
        {},
    );

    $: sumOfIncome = bookingsByLabel["Einnahmen"]?.reduce(
        (
            /** @type {number} */ sum,
            /** @type {{ amount: string; }} */ booking,
        ) => sum + parseFloat(booking?.amount),
        0,
    );

    $: sumOfExpenses = bookingsByLabel["Ausgaben"]?.reduce(
        (
            /** @type {number} */ sum,
            /** @type {{ amount: string; }} */ booking,
        ) => sum + parseFloat(booking?.amount),
        0,
    );

    $: sumOfReverseCharge = bookingsByLabel["Reverse Charge"]?.reduce(
        (
            /** @type {number} */ sum,
            /** @type {{ amount: string; }} */ booking,
        ) => sum + parseFloat(booking?.amount),
        0,
    );
</script>

<Heading tag="h4" class="text-center text-primary-700 mb-4">KÖSt</Heading>

<Table class="mb-8">
    <TableHead>
        <TableHeadCell>Kategorie</TableHeadCell>
        <TableHeadCell class="text-right">Summe</TableHeadCell>
    </TableHead>
    <TableBody tableBodyClass="divide-y">
        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <Badge color="green" rounded class="px-2 py-1 m-1 relative">
                    <Indicator color="green" size="md" class="me-1" /><span
                        class="text-xs">Einnahmen</span
                    >
                </Badge>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-right">
                {sumOfIncome.toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <Badge color="red" rounded class="px-2 py-1 m-1 relative">
                    <Indicator color="red" size="md" class="me-1" /><span
                        class="text-xs">Ausgaben</span
                    >
                </Badge>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-right">
                {sumOfExpenses.toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <div class="pl-1 text-lg">Gewinn</div>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {(sumOfExpenses + sumOfIncome).toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <div class="pl-1 text-lg">KÖSt</div>
                <div class="pl-1 text-xs">25% vom Gewinn</div>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {(-1.0 * (sumOfExpenses + sumOfIncome) * 0.25).toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>
    </TableBody>
</Table>

{#if sumOfReverseCharge}
    <Heading tag="h4" class="text-center text-primary-700 mb-4">
        Reverse Charge
    </Heading>
    <Table class="mb-8">
        <TableHead>
            <TableHeadCell>Kategorie</TableHeadCell>
            <TableHeadCell class="text-right">Summe</TableHeadCell>
        </TableHead>
        <TableBody tableBodyClass="divide-y">
            <TableBodyRow>
                <TableBodyCell class="whitespace-normal p-2">
                    <Badge
                        color="yellow"
                        rounded
                        class="px-2 py-1 m-1 relative"
                    >
                        <Indicator color="yellow" size="md" class="me-1" /><span
                            class="text-xs">Reverse Charge</span
                        >
                    </Badge>
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal text-right">
                    {sumOfReverseCharge?.toFixed(2)}
                </TableBodyCell>
            </TableBodyRow>

            <TableBodyRow>
                <TableBodyCell class="whitespace-normal p-2">
                    <div class="pl-1 text-lg">Reverse Charge (RC)</div>
                    <div class="pl-1 text-xs">20% vom RC-Umsatz</div>
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal text-lg text-right">
                    {(sumOfReverseCharge * 0.2).toFixed(2)}
                </TableBodyCell>
            </TableBodyRow>
        </TableBody>
    </Table>
{/if}
