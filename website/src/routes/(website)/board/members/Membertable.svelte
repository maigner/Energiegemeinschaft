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
    } from "flowbite-svelte";

    import { Input, Label, Button } from "flowbite-svelte";
    import { SearchOutline } from "flowbite-svelte-icons";

    import { Modal } from "flowbite-svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { List, Li, DescriptionList } from "flowbite-svelte";

    // member detail modal visible?
    let memberDetailModal = $state(false);
    // selected member for modal
    let member = $state(data.members[0]);

    let { data } = $props();

    const table = new DataTable({
        /*
		data: [
			{ id: 1, name: 'John Doe', status: 'active' },
			{ id: 2, name: 'Jane Doe', status: 'inactive' }
		],*/
        data: data.members,
        columns: [
            { id: "memberSince", key: "memberSince", name: "seit" },
            { id: "name", key: "name", name: "Name" },
        ],
    });
</script>

<Modal title="Mitglied #{member.identifier}" autoclose bind:open={memberDetailModal}>
    <List
        tag="dl"
        class="divide-y divide-gray-200 text-gray-900 dark:divide-gray-700  dark:text-white"
    >
        <div class="flex flex-col pb-3">
            <DescriptionList tag="dt" class="mb-1">Name</DescriptionList>
            <DescriptionList tag="dd">{member.name}</DescriptionList>
        </div>

        <div class="flex flex-col pb-3">
            <DescriptionList tag="dt" class="mb-1">Mitglied seit</DescriptionList>
            <DescriptionList tag="dd">{member.memberSince}</DescriptionList>
        </div>

        <div class="flex flex-col pb-3">
            <DescriptionList tag="dt" class="mb-1">E-Mail</DescriptionList>
            <DescriptionList tag="dd">{member.email}</DescriptionList>
        </div>

        <div class="flex flex-col pb-3">
            <DescriptionList tag="dt" class="mb-1">Adresse</DescriptionList>
            <DescriptionList tag="dd">{member.street}, {member.hnr}</DescriptionList>
        </div>

        <div class="flex flex-col pb-3">
            <DescriptionList tag="dt" class="mb-1">Name</DescriptionList>
            <DescriptionList tag="dd">{member.name}</DescriptionList>
        </div>
    </List>

    {#snippet footer()}
        <Button
            onclick={() => {
                memberDetailModal = false;
            }}>OK</Button
        >
    {/snippet}
</Modal>

<div class="flex flex-col">
    <Heading class="text-primary-700 text-center" tag="h6">Mitglieder</Heading>
    <div class="mx-4">
        <Input
            id="search"
            placeholder="Search"
            size="md"
            class="ps-9"
            bind:value={table.globalFilter}
        >
            {#snippet left()}
                <SearchOutline
                    class="h-6 w-6 text-gray-500 dark:text-gray-400"
                />
            {/snippet}
            {#snippet right()}
                <Button
                    size="xs"
                    type="button"
                    on:click={() => {
                        table.globalFilter = "";
                    }}>Clear</Button
                >
            {/snippet}
        </Input>
    </div>

    <div class="mt-16">
        <Table>
            <TableHead>
                {#each table.columns as column (column.id)}
                    <TableHeadCell>{column.name}</TableHeadCell>
                {/each}
            </TableHead>
            <TableBody>
                {#each table.rows as row (row.id)}
                    <TableBodyRow
                        on:click={() => {
                            member = row;
                            memberDetailModal = true;
                        }}
                    >
                        {#each table.columns as column (column.id)}
                            <TableBodyCell>
                                {row[column.key]}
                            </TableBodyCell>
                        {/each}
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>
</div>
