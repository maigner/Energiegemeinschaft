<script>
    import { DataTable } from "@careswitch/svelte-data-table";
    import {
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
        Heading,
        Input,
        Button,
        Modal,
        List,
        DescriptionList,
    } from "flowbite-svelte";
    import {
        SearchOutline,
        ChevronLeftOutline,
        ChevronRightOutline,
    } from "flowbite-svelte-icons";

    /** @type {{ members: any[] }} */
    let { members } = $props();

    let memberDetailModal = $state(false);
    let member = $state(/** @type {any} */ (null));

    const table = new DataTable({
        data: members,
        columns: [
            { id: "name", key: "name", name: "Name", sortable: true },
            {
                id: "address",
                key: "street",
                name: "Adresse",
                getValue: (/** @type {any} */ r) =>
                    [r.street, r.hnr, r.zip, r.city].filter(Boolean).join(" "),
            },
            { id: "email", key: "email", name: "E-Mail" },
            {
                id: "memberSince",
                key: "memberSince",
                name: "Mitglied seit",
                sortable: true,
            },
        ],
        pageSize: 15,
    });

    const sortIndicator = (/** @type {string} */ id) => {
        const dir = table.getSortState(id);
        return dir === "asc" ? " ↑" : dir === "desc" ? " ↓" : "";
    };
</script>

{#if member}
    <Modal
        title="Mitglied #{member.identifier}"
        autoclose
        bind:open={memberDetailModal}
    >
        <List
            tag="dl"
            class="divide-y divide-gray-200 text-gray-900 dark:divide-gray-700 dark:text-white"
        >
            <div class="flex flex-col pb-3">
                <DescriptionList tag="dt" class="mb-1">Name</DescriptionList>
                <DescriptionList tag="dd">{member.name}</DescriptionList>
            </div>

            <div class="flex flex-col pb-3">
                <DescriptionList tag="dt" class="mb-1"
                    >Mitglied seit</DescriptionList
                >
                <DescriptionList tag="dd">{member.memberSince}</DescriptionList>
            </div>

            <div class="flex flex-col pb-3">
                <DescriptionList tag="dt" class="mb-1">E-Mail</DescriptionList>
                <DescriptionList tag="dd">{member.email}</DescriptionList>
            </div>

            <div class="flex flex-col pb-3">
                <DescriptionList tag="dt" class="mb-1">Adresse</DescriptionList>
                <DescriptionList tag="dd">
                    {member.street}
                    {member.hnr}, {member.zip}
                    {member.city}
                </DescriptionList>
            </div>
        </List>

        <Button href="/board/members/member/{member.identifier}">
            Energiekurven anzeigen
        </Button>

        {#snippet footer()}
            <Button
                onclick={() => {
                    memberDetailModal = false;
                }}>OK</Button
            >
        {/snippet}
    </Modal>
{/if}

<div class="flex flex-col">
    <div class="flex items-center justify-between gap-4 mb-4">
        <Heading tag="h2" class="text-xl font-semibold w-auto">
            Mitglieder ({members.length})
        </Heading>
        <div class="w-full max-w-xs">
            <Input
                id="search"
                placeholder="Name, Adresse, E-Mail…"
                size="md"
                class="ps-9"
                bind:value={table.globalFilter}
            >
                {#snippet left()}
                    <SearchOutline
                        class="h-5 w-5 text-gray-500 dark:text-gray-400"
                    />
                {/snippet}
                {#snippet right()}
                    {#if table.globalFilter}
                        <Button
                            size="xs"
                            type="button"
                            color="alternative"
                            onclick={() => {
                                table.globalFilter = "";
                            }}>×</Button
                        >
                    {/if}
                {/snippet}
            </Input>
        </div>
    </div>

    <Table hoverable>
        <TableHead>
            <TableHeadCell
                class="cursor-pointer select-none"
                onclick={() => table.toggleSort("name")}
            >
                Name{sortIndicator("name")}
            </TableHeadCell>
            <TableHeadCell class="hidden md:table-cell">Adresse</TableHeadCell>
            <TableHeadCell
                class="cursor-pointer select-none whitespace-nowrap"
                onclick={() => table.toggleSort("memberSince")}
            >
                Mitglied seit{sortIndicator("memberSince")}
            </TableHeadCell>
        </TableHead>
        <TableBody>
            {#each table.rows as row (row.id)}
                <TableBodyRow
                    class="cursor-pointer"
                    onclick={() => {
                        member = row;
                        memberDetailModal = true;
                    }}
                >
                    <TableBodyCell>
                        <div class="font-medium">{row.name}</div>
                        <div
                            class="text-xs text-gray-500 dark:text-gray-400 md:hidden"
                        >
                            {row.street}
                            {row.hnr}
                        </div>
                    </TableBodyCell>
                    <TableBodyCell class="hidden md:table-cell">
                        {row.street}
                        {row.hnr}, {row.zip}
                        {row.city}
                    </TableBodyCell>
                    <TableBodyCell class="whitespace-nowrap">
                        {row.memberSince}
                    </TableBodyCell>
                </TableBodyRow>
            {:else}
                <TableBodyRow>
                    <TableBodyCell colspan={3}>
                        Keine Mitglieder gefunden.
                    </TableBodyCell>
                </TableBodyRow>
            {/each}
        </TableBody>
    </Table>

    <div class="flex items-center justify-between mt-4">
        <span class="text-sm text-gray-500 dark:text-gray-400">
            {table.allRows.length}
            {table.allRows.length === 1 ? "Mitglied" : "Mitglieder"}
            {#if table.totalPages > 1}
                · Seite {table.currentPage} von {table.totalPages}
            {/if}
        </span>
        {#if table.totalPages > 1}
            <div class="flex gap-2">
                <Button
                    size="xs"
                    color="alternative"
                    disabled={!table.canGoBack}
                    onclick={() => (table.currentPage -= 1)}
                >
                    <ChevronLeftOutline class="w-4 h-4 me-1" />
                    Zurück
                </Button>
                <Button
                    size="xs"
                    color="alternative"
                    disabled={!table.canGoForward}
                    onclick={() => (table.currentPage += 1)}
                >
                    Weiter
                    <ChevronRightOutline class="w-4 h-4 ms-1" />
                </Button>
            </div>
        {/if}
    </div>
</div>
