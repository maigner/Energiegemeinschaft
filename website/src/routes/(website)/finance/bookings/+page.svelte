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
        Heading,
        Select,
        Button,
    } from "flowbite-svelte";

    import { Tabs, TabItem } from "flowbite-svelte";

    import { formatDate } from "$lib/format";
    import LabelBox from "./LabelBox.svelte";
    import Dashboard from "./Dashboard.svelte";
    import FileBox from "./FileBox.svelte";
    import Taxes from "./Taxes.svelte";
    import { browser } from "$app/environment";
    import GeorgeImport from "./GeorgeImport.svelte";

    export let data;

    /**
     * @type {string}
     */
    let year = "2024";

    $: data.filteredBookings = data.bookings.filter(
        (
            /** @type {{ booking_date: { getFullYear: () => number; }; }} */ booking,
        ) => {
            return booking.booking_date.getFullYear() === parseInt(year);
        },
    );
</script>

<Heading tag="h3" class="text-center text-primary-700 mb-4">
    Buchhaltung
</Heading>

<div id="selectYear" class="max-w-32 w-32 flex justify-center m-auto">
    <div class="flex">
        <Select
            class="mt-2 mb-4 text-center"
            items={[
                { value: "2023", name: "2023" },
                { value: "2024", name: "2024" },
                { value: "2025", name: "2025" },
            ]}
            bind:value={year}
            placeholder="Jahr"
        />
    </div>
</div>

<Tabs tabStyle="underline">
    <TabItem open title="Übersicht">
        <Dashboard bind:data />
    </TabItem>
    <TabItem title="Buchungen">
        <Table>
            <TableHead>
                <TableHeadCell>Buchung</TableHeadCell>
                <TableHeadCell>Details</TableHeadCell>
            </TableHead>
            <TableBody tableBodyClass="divide-y">
                {#each data.filteredBookings as booking, index (booking.id)}
                    <TableBodyRow
                        class={index % 2 === 0 ? "bg-white" : "bg-gray-100"}
                    >
                        <TableBodyCell class="flex items-start">
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

                            <div class="mt-4">
                                <FileBox bind:data bookingId={booking.id} />
                            </div>
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </TabItem>
    <TabItem title="Steuern">
        <Taxes bind:data />
    </TabItem>
    <TabItem title="George">
        <GeorgeImport bind:data />
    </TabItem>
</Tabs>

