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
    import { Pagination, PaginationItem } from "flowbite-svelte";

    import { Input, Label, Button } from "flowbite-svelte";
    import { SearchOutline } from "flowbite-svelte-icons";

    import { Modal } from "flowbite-svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { List, Li, DescriptionList } from "flowbite-svelte";
    import { goto } from "$app/navigation";

    let { data } = $props();

    // member detail modal visible?
    let memberDetailModal = $state(false);
    // selected member for modal
    let member = $state(data.members[0]);

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
        pageSize: 300,
    });


</script>


<Modal
    title="Mitglied #{member.identifier}"
    autoclose
    bind:open={memberDetailModal}
>
    <List
        tag="dl"
        class="divide-y divide-gray-200 text-gray-900 dark:divide-gray-700  dark:text-white"
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
            <DescriptionList tag="dd"
                >{member.street}, {member.hnr}</DescriptionList
            >
        </div>
    </List>

    <Button href="/board/members/member/{member.identifier}"
        >Energiekurven anzeigen</Button
    >

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






    <div>

    </div>






    <div class="mt-8">
        <Table>
            <TableHead>
                    <TableHeadCell>Name<br /> Mitglied seit</TableHeadCell>
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
                                <div>
                                    {row['name']}
                                </div>
                                <div class="text-xs">
                                    {row['street']} {row['hnr']}
                                </div>
                                <div class="text-xs">
                                    {row['memberSince']}
                                </div>
                            </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>
</div>
