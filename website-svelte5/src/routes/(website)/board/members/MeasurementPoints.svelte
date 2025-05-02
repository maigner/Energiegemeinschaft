<script>
    import { Heading } from "flowbite-svelte";
    import {
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";

    export let data;

    let pending = data.measurementPoints.filter((p) => p.status === "PENDING");
    let invalid = data.measurementPoints.filter((p) => p.status === "INVALID");
    let rejected = data.measurementPoints.filter((p) => p.status === "REJECTED");
    let active = data.measurementPoints.filter((p) => p.status === "ACTIVE");


</script>

<div class="w-full">
    <Heading class="text-primary-700 text-center" tag="h6">Zählpunkte</Heading>

    <!--
    <div class="text-xs">
        {JSON.stringify(pending[0])}
    </div>
    -->

    <Table>
        <caption
            class="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800"
        >
            Zustimmung des Mitglieds noch ausstehend
            <p
                class="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400"
            >
                Folgende ZPs haben den Status PENDING. Das bedeutet...
            </p>
        </caption>
        <TableHead>
            <TableHeadCell>Zählpunktnummer</TableHeadCell>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>
                <span class="sr-only">Edit</span>
            </TableHeadCell>
        </TableHead>
        <TableBody tableBodyClass="divide-y">
            {#each pending as p}
                <TableBodyRow>
                    <TableBodyCell class="text-xs">
                        {p.mp_identifier}
                        <br />
                        {p.type}
                    </TableBodyCell>
                    <TableBodyCell>{p.name}</TableBodyCell>
                    <TableBodyCell>
                        <a
                            href="/board/members"
                            class="font-medium text-primary-600 hover:underline dark:text-primary-500"
                            >Anstupsen</a
                        >
                    </TableBodyCell>
                </TableBodyRow>
            {/each}
        </TableBody>
    </Table>


    <Table>
        <caption
            class="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800"
        >
        Zählpunkt wurde vom Netzbetreiber abgewiesen.
            <p
                class="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400"
            >
                Folgende ZPs haben den Status REJECTED. Das bedeutet...
            </p>
        </caption>
        <TableHead>
            <TableHeadCell>Zählpunktnummer</TableHeadCell>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>
                <span class="sr-only">Edit</span>
            </TableHeadCell>
        </TableHead>
        <TableBody tableBodyClass="divide-y">
            {#each rejected as p}
                <TableBodyRow>
                    <TableBodyCell class="text-xs">
                        {p.mp_identifier}
                        <br />
                        {p.type}
                    </TableBodyCell>
                    <TableBodyCell>{p.name}</TableBodyCell>
                    <TableBodyCell>
                        <a
                            href="/board/members"
                            class="font-medium text-primary-600 hover:underline dark:text-primary-500"
                            >Anstupsen</a
                        >
                    </TableBodyCell>
                </TableBodyRow>
            {/each}
        </TableBody>
    </Table>

    <Table>
        <caption
            class="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800"
        >
        Kunde hat auf Datenfreigabe nicht reagiert (Timeout)
            <p
                class="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400"
            >
                Folgende ZPs haben den Status INVALID. Das bedeutet...
            </p>
        </caption>
        <TableHead>
            <TableHeadCell>Zählpunktnummer</TableHeadCell>
            <TableHeadCell>Name</TableHeadCell>
            <TableHeadCell>
                <span class="sr-only">Edit</span>
            </TableHeadCell>
        </TableHead>
        <TableBody tableBodyClass="divide-y">
            {#each invalid as p}
                <TableBodyRow>
                    <TableBodyCell class="text-xs">
                        {p.mp_identifier}
                        <br />
                        {p.type}
                    </TableBodyCell>
                    <TableBodyCell>{p.name}</TableBodyCell>
                    <TableBodyCell>
                        <a
                            href="/board/members"
                            class="font-medium text-primary-600 hover:underline dark:text-primary-500"
                            >Anstupsen</a
                        >
                    </TableBodyCell>
                </TableBodyRow>
            {/each}
        </TableBody>
    </Table>

    <Table>
        <caption
            class="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800"
        >
        Zählpunkt aktiv
            <p
                class="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400"
            >
                Folgende ZPs haben den Status ACTIVE. Das bedeutet...
            </p>
        </caption>
        <TableHead>
            <TableHeadCell>Zählpunktnummer</TableHeadCell>
            <TableHeadCell>Name</TableHeadCell>
            
        </TableHead>
        <TableBody tableBodyClass="divide-y">
            {#each active as p}
                <TableBodyRow>
                    <TableBodyCell class="text-xs">
                        {p.mp_identifier}
                        <br />
                        {p.type}
                    </TableBodyCell>
                    <TableBodyCell>{p.name}</TableBodyCell>
                    
                </TableBodyRow>
            {/each}
        </TableBody>
    </Table>

    <span class="text-xs"></span>
</div>
