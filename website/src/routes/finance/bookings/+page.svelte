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
    import { tick } from "svelte";
    import LabelBox from "./LabelBox.svelte";
    import Dashboard from "./Dashboard.svelte";

    export let data;
</script>

<Heading tag="h3" class="text-center text-primary-700 mb-4">Buchhaltung</Heading
>

<Heading tag="h4" class="text-center text-primary-700 mb-4">Übersicht</Heading>

<Dashboard bind:data />

<Heading tag="h4" class="text-center text-primary-700 mb-4">Buchungen</Heading>

<Table>
    <TableHead>
        <TableHeadCell>Buchung</TableHeadCell>
        <TableHeadCell>Details</TableHeadCell>
    </TableHead>
    <TableBody tableBodyClass="divide-y">
        {#each data.bookings as booking, index}
            <TableBodyRow class={index % 2 === 0 ? "bg-white" : "bg-gray-100"}>
                <TableBodyCell>
                    <List
                        tag="dl"
                        class="text-gray-900 dark:text-white divide-gray-200  dark:divide-gray-700"
                    >
                        <div class="flex flex-col pb-3">
                            <DescriptionList tag="dt" class="mb-1"
                                >Betrag</DescriptionList
                            >
                            <DescriptionList tag="dd">
                                <span class="text-md">
                                    {booking.amount}
                                </span>
                            </DescriptionList>
                        </div>

                        <div class="flex flex-col pb-3">
                            <DescriptionList tag="dt" class="mb-1"
                                >Buchung</DescriptionList
                            >
                            <DescriptionList tag="dd">
                                <span class="text-xs">
                                    {formatDate(booking.booking_date)}
                                </span>
                            </DescriptionList>
                        </div>
                        <div class="flex flex-col pb-3">
                            <DescriptionList tag="dt" class="mb-1"
                                >Valuta</DescriptionList
                            >
                            <DescriptionList tag="dd">
                                <span class="text-xs">
                                    {formatDate(booking.value_date)}
                                </span>
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
                                    <span class="text-sm">
                                        {booking.partner_name}
                                    </span>
                                </DescriptionList>
                            </div>
                        {/if}

                        {#if booking.partner_iban}
                            <div class="flex flex-col pb-3">
                                <DescriptionList tag="dt" class="mb-1"
                                    >IBAN</DescriptionList
                                >
                                <DescriptionList tag="dd">
                                    <span class="text-sm">
                                        {booking.partner_iban}
                                    </span>
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

                    <LabelBox bind:data bookingId={booking.id} />
                </TableBodyCell>
            </TableBodyRow>
        {/each}
    </TableBody>
</Table>
