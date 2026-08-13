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
        Badge,
    } from "flowbite-svelte";
    import {
        SearchOutline,
        ChevronLeftOutline,
        ChevronRightOutline,
    } from "flowbite-svelte-icons";
    import { goto } from "$app/navigation";

    /** @type {{ members: any[] }} */
    let { members } = $props();

    // EEG-Status eines Mitglieds, abgeleitet aus seinen Zählpunkten
    const statusLabel = (/** @type {any} */ r) => {
        if (r.pointsActive > 0 && r.pointsOpen > 0) return "teilweise aktiv";
        if (r.pointsActive > 0) return "aktiv";
        if (r.pointsOpen > 0) return "ausständig";
        return r.pointsTotal > 0 ? "inaktiv" : "kein Zählpunkt";
    };

    /** @type {Record<string, { color: any, rank: number }>} */
    const statusMeta = {
        ausständig: { color: "red", rank: 0 },
        "teilweise aktiv": { color: "yellow", rank: 1 },
        aktiv: { color: "green", rank: 2 },
        inaktiv: { color: "gray", rank: 3 },
        "kein Zählpunkt": { color: "gray", rank: 4 },
    };

    const statusCounts = members.reduce(
        (/** @type {Record<string, number>} */ acc, m) => {
            const label = statusLabel(m);
            acc[label] = (acc[label] ?? 0) + 1;
            return acc;
        },
        {},
    );

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
                id: "status",
                key: "id",
                name: "Status",
                sortable: true,
                getValue: statusLabel,
                sorter: (/** @type {string} */ a, /** @type {string} */ b) =>
                    statusMeta[a].rank - statusMeta[b].rank,
            },
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

    <div class="flex flex-wrap gap-2 mb-4">
        {#each Object.keys(statusMeta) as label}
            {#if statusCounts[label]}
                <Button
                    size="xs"
                    color={table.isFilterActive("status", label)
                        ? "primary"
                        : "alternative"}
                    onclick={() => table.toggleFilter("status", label)}
                >
                    <Badge color={statusMeta[label].color} class="me-2">
                        {statusCounts[label]}
                    </Badge>
                    {label}
                </Button>
            {/if}
        {/each}
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
                class="cursor-pointer select-none"
                onclick={() => table.toggleSort("status")}
            >
                Status{sortIndicator("status")}
            </TableHeadCell>
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
                    onclick={() =>
                        goto(`/board/members/member/${row.identifier}`)}
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
                    <TableBodyCell>
                        <Badge color={statusMeta[statusLabel(row)].color}>
                            {statusLabel(row)}
                        </Badge>
                        {#if statusLabel(row) === "teilweise aktiv"}
                            <div
                                class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                            >
                                {row.pointsActive} von {row.pointsActive +
                                    row.pointsOpen} Zählpunkten aktiv
                            </div>
                        {/if}
                    </TableBodyCell>
                    <TableBodyCell class="whitespace-nowrap">
                        {row.memberSince}
                    </TableBodyCell>
                </TableBodyRow>
            {:else}
                <TableBodyRow>
                    <TableBodyCell colspan={4}>
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
