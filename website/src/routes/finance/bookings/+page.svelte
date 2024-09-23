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
        Tooltip
    } from "flowbite-svelte";

    import { formatDate } from "$lib/format";
    import LabelBox from "./LabelBox.svelte";
    import Dashboard from "./Dashboard.svelte";
    import { UploadOutline } from "flowbite-svelte-icons";
    import FileBox from "./FileBox.svelte";

    export let data;

    /**
     * @type {string}
     */
    let year = "2024";

    $: data.filteredBookings = data.bookings.filter((booking) => {
        return booking.booking_date.getFullYear() === parseInt(year);
    });
</script>

<Heading tag="h3" class="text-center text-primary-700 mb-4">
    Buchhaltung
</Heading>

<div class="max-w-32 w-32 flex justify-center m-auto">
    <div class="flex">
        <Select
            class="mt-2 mb-4 text-center"
            items={[
                { value: "2023", name: "2023" },
                { value: "2024", name: "2024" },
            ]}
            bind:value={year}
            placeholder="Jahr"
        />
    </div>
</div>

<Heading tag="h4" class="text-center text-primary-700 mb-4">Übersicht</Heading>

<Dashboard bind:data />

<Heading tag="h4" class="text-center text-primary-700 mb-4">Buchungen</Heading>

<Table>
    <TableHead>
        <TableHeadCell>Buchung</TableHeadCell>
        <TableHeadCell>Details</TableHeadCell>
    </TableHead>
    <TableBody tableBodyClass="divide-y">
        {#each data.filteredBookings as booking, index (booking.id)}
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
                    <div>
                        <Button color="alternative" 
                            on:click={() => {
                                alert("foo");
                            }}
                        >
                            <UploadOutline />
                        </Button>
                        <Tooltip>Beleg, etc. hochladen</Tooltip>
                    </div>
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

                    <FileBox bind:data bookingId={booking.id} />
                </TableBodyCell>
            </TableBodyRow>
        {/each}
    </TableBody>
</Table>
