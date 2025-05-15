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
        Input,
        Toast,
    } from "flowbite-svelte";
    import { slide } from "svelte/transition";

    import { Tabs, TabItem } from "flowbite-svelte";

    import { formatDate } from "$lib/format";
    import LabelBox from "./LabelBox.svelte";
    import Dashboard from "./Dashboard.svelte";
    import FileBox from "./FileBox.svelte";
    import Taxes from "./Taxes.svelte";
    import { browser } from "$app/environment";
    import GeorgeImport from "./GeorgeImport.svelte";
    import { CheckCircleSolid } from "flowbite-svelte-icons";

    export let data;

    /**
     * @type {string}
     */
    let yearString = "2024"; //new Date().getFullYear().toString();
    $: year = parseInt(yearString);

    $: data.filteredBookings = data.bookings.filter(
        (
            /** @type {{ booking_date: { getFullYear: () => number; }; }} */ booking,
        ) => {
            return booking.booking_date.getFullYear() === year;
        },
    );

    let toastStatus = false;
    let toastText = "";
    let counter = 5;

    function trigger() {
        toastStatus = true;
        counter = 5;
        timeout();
    }

    function timeout() {
        if (--counter > 0) return setTimeout(timeout, 1000);
        toastStatus = false;
    }
</script>

<div
    class="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-sm"
>
    <Toast dismissable={false} transition={slide} bind:toastStatus>
        {#snippet icon()}
            <CheckCircleSolid class="h-5 w-5" />
        {/snippet}
        {toastText}<br />{counter}s.
    </Toast>
</div>

<Heading tag="h3" class="text-center text-primary-700 mb-4">
    Buchhaltung
</Heading>

<div id="selectYear" class="w-36 flex justify-center m-auto">
    <div class="flex">
        <Select
            class="mt-2 mb-4 min-w-20"
            items={[
                { value: "2023", name: "2023" },
                { value: "2024", name: "2024" },
                { value: "2025", name: "2025" },
            ]}
            bind:value={yearString}
            placeholder="Jahr"
        />
    </div>
</div>

<Tabs tabStyle="underline">
    <TabItem title="Übersicht">
        <Dashboard bind:data bind:year />
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
                                <div class="flex flex-col pb-3">
                                    <DescriptionList tag="dt" class="mb-1"
                                        >RC-Betrag</DescriptionList
                                    >
                                    <DescriptionList tag="dd">
                                        <Input
                                            class="max-w-38 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            type="number"
                                            bind:value={
                                                booking.reverse_charge_amount
                                            }
                                            on:change={async () => {
                                                try {
                                                    const res = await fetch(
                                                        "/api/finance/bookings/setReverseChargeAmountOfBooking",
                                                        {
                                                            method: "POST",
                                                            headers: {
                                                                "Content-Type":
                                                                    "application/json",
                                                            },
                                                            body: JSON.stringify(
                                                                {
                                                                    bookingId:
                                                                        booking.id,
                                                                    reverseChargeAmount:
                                                                        booking.reverse_charge_amount,
                                                                },
                                                            ),
                                                        },
                                                    );

                                                    if (!res.ok) {
                                                        const err =
                                                            await res.text();
                                                        throw new Error(
                                                            `Server responded with ${res.status}: ${err}`,
                                                        );
                                                    }

                                                    toastText = `Speichere RC-Betrag: ${booking.reverse_charge_amount}`;
                                                    trigger();

                                                } catch (err) {
                                                    alert(
                                                        "Failed: " +
                                                            err.message,
                                                    );
                                                    console.error(err);
                                                }
                                            }}
                                        />
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
    <TabItem open title="Steuern">
        <Taxes bind:data />
    </TabItem>
    <TabItem title="George">
        <GeorgeImport bind:data />
    </TabItem>
</Tabs>
