<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import {
        Badge,
        Indicator,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";

    let { data, year, bookingsLabels, filteredBookings } = $props();

    let bookingsByLabel = $derived.by(() => {
        return bookingsLabels.reduce(
            (
                /** @type {{ [x: string]: any[]; }} */ group,
                /** @type {{ booking_id: any; label: any; }} */ bookingLabel,
            ) => {
                const bookingId = bookingLabel.booking_id;

                // only filtered bookings
                const booking = filteredBookings.find(
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
    });

    let labelList = $derived.by(() => {
        return Object.keys(bookingsByLabel)
            .map((label) => {
                return data.labels.find(
                    (/** @type {{ label: string; }} */ l) => l.label === label,
                );
            })
            .sort(
                // @ts-ignore
                (
                    /** @type {{ label: string; }} */ a,
                    /** @type {{ label: string; }} */ b,
                ) => a.label.localeCompare(b.label) >= 0,
            );
    });

    let bookingSumOfPreviousYears = $derived.by(() => {
        return data.bookings
            .filter(
                (
                    /** @type {{ booking_date: { getFullYear: () => number; }; }} */ booking,
                ) => {
                    return booking.booking_date.getFullYear() < year;
                },
            )
            .reduce(
                (
                    /** @type {number} */ sum,
                    /** @type {{ amount: string; }} */ booking,
                ) => sum + parseFloat(booking?.amount),
                0,
            );
    });

    let bookingSumCurrentYear = $derived.by(() => {
        return filteredBookings.reduce(
            (
                /** @type {number} */ sum,
                /** @type {{ amount: string; }} */ booking,
            ) => sum + parseFloat(booking.amount),
            0,
        );
    });
</script>

<Table class="mb-8">
    <TableHead>
        <TableHeadCell>Kategorie</TableHeadCell>
        <TableHeadCell class="text-right">Summe</TableHeadCell>
        <TableHeadCell class="text-right">Cash Flow</TableHeadCell>
    </TableHead>
    <TableBody class="divide-y">
        {#each labelList as label, index (label.id)}
            {@const bookings = bookingsByLabel[label.label]}
            <TableBodyRow>
                <TableBodyCell class="whitespace-normal p-2">
                    <Badge
                        color={label.color}
                        rounded
                        class="px-2 py-1 m-1 relative"
                    >
                        <Indicator
                            color={label.color}
                            size="md"
                            class="me-1"
                        /><span class="text-xs">{label.label}</span>
                    </Badge>
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal text-right">
                    {bookings
                        .reduce(
                            (
                                /** @type {number} */ sum,
                                /** @type {{ amount: string; }} */ booking,
                            ) => sum + parseFloat(booking?.amount),
                            0,
                        )
                        .toFixed(2)}
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal text-right">
                    {bookings
                        .reduce(
                            (
                                /** @type {number} */ sum,
                                /** @type {{ amount: string; }} */ booking,
                            ) => sum + Math.abs(parseFloat(booking?.amount)),
                            0,
                        )
                        .toFixed(2)}
                </TableBodyCell>
            </TableBodyRow>
        {/each}

        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <div class="pl-1 text-lg">Gesamt</div>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {data.filteredBookings
                    .reduce(
                        (
                            /** @type {number} */ sum,
                            /** @type {{ amount: string; }} */ booking,
                        ) => sum + parseFloat(booking.amount),
                        0,
                    )
                    .toFixed(2)}
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {data.filteredBookings
                    .reduce(
                        (
                            /** @type {number} */ sum,
                            /** @type {{ amount: string; }} */ booking,
                        ) => sum + Math.abs(parseFloat(booking.amount)),
                        0,
                    )
                    .toFixed(2)}
            </TableBodyCell>
        </TableBodyRow>
        <TableBodyRow>
            <TableBodyCell class="whitespace-normal p-2">
                <div class="pl-1">Finaler Kontostand</div>
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right">
                {(bookingSumCurrentYear + bookingSumOfPreviousYears).toFixed(2)}
            </TableBodyCell>

            <TableBodyCell class="whitespace-normal text-lg text-right"
            ></TableBodyCell>
        </TableBodyRow>
    </TableBody>
</Table>
