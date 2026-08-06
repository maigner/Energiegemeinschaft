<script>
    import {
        Heading,
        Button,
        Badge,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
        Accordion,
        AccordionItem,
    } from "flowbite-svelte";
    import { DownloadSolid } from "flowbite-svelte-icons";

    let { data } = $props();

    const typeLabel = (t) => (t === "company" ? "Firma" : "Privatperson");
    const pointLabel = (t) => (t === "CONSUMPTION" ? "Bezug" : "Einspeisung");
</script>

<svelte:head>
    <title>ISCHLSTROM - Bewerbungen</title>
</svelte:head>

<div class="px-4 mt-4 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-4">
        <Heading tag="h2" class="text-xl font-semibold">
            Bewerbungen ({data.applications.length})
        </Heading>
        {#if data.applications.length > 0}
            <Button href="/board/members/applications/download" download>
                <DownloadSolid class="w-4 h-4 me-2" />
                Excel herunterladen
            </Button>
        {/if}
    </div>

    {#if data.applications.length === 0}
        <p class="text-gray-500 dark:text-gray-400">
            Derzeit liegen keine Bewerbungen vor.
        </p>
    {:else}
        <Accordion>
            {#each data.applications as a (a.id)}
                <AccordionItem>
                    {#snippet header()}
                        <span
                            id={"application-" + a.id}
                            class="flex items-center gap-3"
                        >
                            <Badge>Nr. {a.id}</Badge>
                            <span>
                                {a.applicantType === "company"
                                    ? a.companyName
                                    : `${a.firstName} ${a.lastName}`}
                            </span>
                            <span class="text-sm text-gray-500">
                                {a.createdAtLabel}
                            </span>
                        </span>
                    {/snippet}

                    <Table>
                        <TableHead>
                            <TableHeadCell>Feld</TableHeadCell>
                            <TableHeadCell>Wert</TableHeadCell>
                        </TableHead>
                        <TableBody>
                            <TableBodyRow>
                                <TableBodyCell>Eingegangen</TableBodyCell>
                                <TableBodyCell>{a.createdAtLabel}</TableBodyCell>
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>Art</TableBodyCell>
                                <TableBodyCell
                                    >{typeLabel(a.applicantType)}</TableBodyCell
                                >
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>Name</TableBodyCell>
                                <TableBodyCell>
                                    {a.applicantType === "company"
                                        ? a.companyName
                                        : `${a.firstName} ${a.lastName}`}
                                </TableBodyCell>
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>E-Mail</TableBodyCell>
                                <TableBodyCell>{a.email}</TableBodyCell>
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>Anschrift</TableBodyCell>
                                <TableBodyCell>
                                    {a.street}
                                    {a.hnr}, {a.zip}
                                    {a.city}
                                </TableBodyCell>
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>IBAN</TableBodyCell>
                                <TableBodyCell>{a.iban}</TableBodyCell>
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>Kontoinhaber</TableBodyCell>
                                <TableBodyCell>{a.accountName}</TableBodyCell>
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>Zählpunkte</TableBodyCell>
                                <TableBodyCell>
                                    {#each a.measurementPoints as p}
                                        <div>
                                            {p.identifier} ({pointLabel(
                                                p.type,
                                            )})
                                        </div>
                                    {/each}
                                </TableBodyCell>
                            </TableBodyRow>
                            <TableBodyRow>
                                <TableBodyCell>Erklärungen</TableBodyCell>
                                <TableBodyCell>
                                    <div class="flex flex-wrap gap-2">
                                        <Badge
                                            color={a.acceptedTerms
                                                ? "green"
                                                : "red"}>Statuten</Badge
                                        >
                                        <Badge
                                            color={a.acceptedSepa
                                                ? "green"
                                                : "red"}>SEPA-Mandat</Badge
                                        >
                                        <Badge
                                            color={a.acknowledgedPrivacyNotice
                                                ? "green"
                                                : "red"}>Datenschutz</Badge
                                        >
                                    </div>
                                </TableBodyCell>
                            </TableBodyRow>
                        </TableBody>
                    </Table>
                </AccordionItem>
            {/each}
        </Accordion>
    {/if}
</div>
