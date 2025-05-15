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

            // only filtered bookings. by current year
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

    $: sumOfReverseCharge = data.filteredBookings
        .filter((booking) => booking.reverse_charge_amount)
        .reduce(
            (
                /** @type {number} */ sum,
                /** @type {{ amount: string; }} */ booking,
            ) => sum + parseFloat(booking?.reverse_charge_amount),
            0,
        );

    $: turnover = sumOfIncome + Math.abs(sumOfExpenses);
</script>

<Heading tag="h4" class="text-center text-primary-700 mb-4">K2a: KÖSt</Heading>
<span class="text-xs">
    Beilage für betriebliche Einkünfte
</span>

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
                <span class="text-xs">
                    (Kennzahl 9040)
                </span>
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
                <span class="text-xs">
                    (Kennzahl 9100)
                </span>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-right">
                {sumOfExpenses.toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <div class="pl-1 text-lg">Gewinn</div>
                <span class="text-xs">
                    (Kennzahl 636)
                </span>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {(sumOfExpenses + sumOfIncome).toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <div class="pl-1 text-lg">Erwartete KÖSt</div>
                <div class="pl-1 text-xs">23% vom Gewinn</div>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {(-1.0 * (sumOfExpenses + sumOfIncome) * 0.23).toFixed(2)}
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
                    <div class="pl-1 text-lg">Erwartete Reverse Charge</div>
                    <div class="pl-1 text-xs">20% vom RC-Umsatz</div>
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal text-lg text-right">
                    {(sumOfReverseCharge * 0.2).toFixed(2)}
                </TableBodyCell>
            </TableBodyRow>
        </TableBody>
    </Table>
{/if}

<Heading tag="h4" class="text-center text-primary-700 mb-4">Kleinunternehmer</Heading>

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
                <div class="pl-1 text-lg">Umsatz</div>
                <div class="pl-1 text-xs">Einnahmen + |Ausgaben|</div>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {turnover.toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <div class="pl-1 text-lg">Umsatzgrenze</div>
                <div class="pl-1 text-xs">EUR: 55 000</div>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {((turnover / 55000) * 100).toFixed(2)}%
            </TableBodyCell>
        </TableBodyRow>
    </TableBody>
</Table>
