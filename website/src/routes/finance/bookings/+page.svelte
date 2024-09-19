<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import {
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
        List,
        DescriptionList,
        Label,
        Heading,
        Select,
    } from "flowbite-svelte";

    import { formatDate } from "$lib/format";

    export let data;
</script>

<Heading tag="h1" class="text-primary-700 mb-4">Buchungen</Heading>

<JsonView json={data.bookingLabels} />

<Table>
    <TableHead>
        <TableHeadCell>Datum</TableHeadCell>
        <TableHeadCell>Partner</TableHeadCell>
        <TableHeadCell>Betrag</TableHeadCell>
    </TableHead>
    <TableBody tableBodyClass="divide-y">
        {#each data.bookings as booking, index}
            <TableBodyRow class={index % 2 === 0 ? "bg-white" : "bg-gray-100"}>
                <TableBodyCell>
                    <List
                        tag="dl"
                        class=" text-gray-900 dark:text-white divide-gray-200  dark:divide-gray-700"
                    >
                        <div class="flex flex-col pb-3">
                            <DescriptionList tag="dt" class="mb-1"
                                >Buchung</DescriptionList
                            >
                            <DescriptionList tag="dd">
                                {formatDate(booking.booking_date)}
                            </DescriptionList>
                        </div>
                        <div class="flex flex-col pb-3">
                            <DescriptionList tag="dt" class="mb-1"
                                >Valuta</DescriptionList
                            >
                            <DescriptionList tag="dd">
                                {formatDate(booking.value_date)}
                            </DescriptionList>
                        </div>
                    </List>
                </TableBodyCell>

                <TableBodyCell class="whitespace-normal">
                    <List
                        tag="dl"
                        class=" text-gray-900 dark:text-white divide-gray-200  dark:divide-gray-700"
                    >
                        {#if booking.partner_name}
                            <div class="flex flex-col pb-3">
                                <DescriptionList tag="dt" class="mb-1"
                                    >Name</DescriptionList
                                >
                                <DescriptionList tag="dd">
                                    {booking.partner_name}
                                </DescriptionList>
                            </div>
                        {/if}

                        {#if booking.partner_iban}
                            <div class="flex flex-col pb-3">
                                <DescriptionList tag="dt" class="mb-1"
                                    >IBAN</DescriptionList
                                >
                                <DescriptionList tag="dd">
                                    {booking.partner_iban}
                                </DescriptionList>
                            </div>
                        {/if}

                        {#if booking.booking_details}
                            <div class="flex flex-col pb-3">
                                <DescriptionList tag="dt" class="mb-1"
                                    >Details</DescriptionList
                                >
                                <DescriptionList tag="dd">
                                    <span class="text-xs">
                                        {booking.booking_details}
                                    </span>
                                </DescriptionList>
                            </div>
                        {/if}
                    </List>

                    <div
                        class="flex justify-between items-center p-4 bg-yellow-200"
                    >
                        <div class="bg-blue-500 text-white p-4">
                            existing labels
                        </div>
                        <div class="bg-green-500 text-white p-4">
                            add new label

                            <Select
                                class="mt-2"
                                placeholder="Label..."
                                items={data.bookingLabels.map((e) => {
                                    return {
                                        value: e.id,
                                        name: e.label,
                                    };
                                })}
                                on:change={(e) => {
                                    alert(JSON.stringify(e));
                                }}
                            />

                        </div>
                    </div>
                </TableBodyCell>

                <TableBodyCell>
                    <div class="flex justify-end">
                        <div class="text-xl">
                            {booking.amount}
                        </div>
                    </div>
                </TableBodyCell>
            </TableBodyRow>
        {/each}
    </TableBody>
</Table>
