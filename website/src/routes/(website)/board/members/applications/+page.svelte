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

    /** Zählpunkt-Identifier vergleichbar machen (Leerzeichen, Schreibweise) */
    const norm = (/** @type {string} */ s) =>
        (s ?? "").toUpperCase().replace(/\s/g, "");

    /** Ist dieser Zählpunkt der Bewerbung schon im Stammdaten-Bestand? */
    const pointImported = (
        /** @type {any} */ a,
        /** @type {{ identifier: string }} */ p,
    ) =>
        (a.importedIdentifiers ?? []).some(
            (/** @type {string} */ id) => norm(id) === norm(p.identifier),
        );

    // Übernommen = alle Zählpunkte der Bewerbung existieren bereits in
    // members_measurementpoint (kommt aus dem EEG-Faktura-Stammdaten-Import).
    const isImported = (/** @type {any} */ a) =>
        a.measurementPoints.length > 0 &&
        a.measurementPoints.every(
            (/** @type {{ identifier: string }} */ p) => pointImported(a, p),
        );

    let openApplications = $derived(
        data.applications.filter((/** @type {any} */ a) => !isImported(a)),
    );
    let importedApplications = $derived(data.applications.filter(isImported));
</script>

<svelte:head>
    <title>ISCHLSTROM - Bewerbungen</title>
</svelte:head>

<div class="px-4 mt-4 max-w-4xl mx-auto">
    {#snippet applicationItem(/** @type {any} */ a)}
        <AccordionItem>
            {#snippet header()}
                <span id={"application-" + a.id} class="flex items-center gap-3">
                    <Badge>Nr. {a.id}</Badge>
                    <span>
                        {a.applicantType === "company"
                            ? a.companyName
                            : `${a.firstName} ${a.lastName}`}
                    </span>
                    <span class="text-sm text-gray-500">
                        {a.createdAtLabel}
                    </span>
                    {#if !isImported(a) && a.measurementPoints.some( (/** @type {{ identifier: string }} */ p) => pointImported(a, p), )}
                        <Badge color="yellow">teilweise übernommen</Badge>
                    {/if}
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
                        <TableBodyCell>{typeLabel(a.applicantType)}</TableBodyCell>
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
                                <div class="flex items-center gap-2 mb-1">
                                    <span>
                                        {p.identifier} ({pointLabel(p.type)})
                                    </span>
                                    {#if pointImported(a, p)}
                                        <Badge color="green">im Bestand</Badge>
                                    {:else}
                                        <Badge color="yellow">fehlt noch</Badge>
                                    {/if}
                                </div>
                            {/each}
                        </TableBodyCell>
                    </TableBodyRow>
                    <TableBodyRow>
                        <TableBodyCell>Erklärungen</TableBodyCell>
                        <TableBodyCell>
                            <div class="flex flex-wrap gap-2">
                                <Badge color={a.acceptedTerms ? "green" : "red"}>
                                    Statuten
                                </Badge>
                                <Badge color={a.acceptedSepa ? "green" : "red"}>
                                    SEPA-Mandat
                                </Badge>
                                <Badge
                                    color={a.acknowledgedPrivacyNotice
                                        ? "green"
                                        : "red"}
                                >
                                    Datenschutz
                                </Badge>
                            </div>
                        </TableBodyCell>
                    </TableBodyRow>
                </TableBody>
            </Table>
        </AccordionItem>
    {/snippet}

    <div class="flex items-center justify-between mb-4">
        <Heading tag="h2" class="text-xl font-semibold">
            Offene Bewerbungen ({openApplications.length})
        </Heading>
        {#if data.applications.length > 0}
            <Button href="/board/members/applications/download" download>
                <DownloadSolid class="w-4 h-4 me-2" />
                Excel herunterladen
            </Button>
        {/if}
    </div>

    {#if openApplications.length === 0}
        <p class="text-gray-500 dark:text-gray-400">
            {data.applications.length === 0
                ? "Derzeit liegen keine Bewerbungen vor."
                : "Keine offenen Bewerbungen - alle Zählpunkte sind bereits im Stammdaten-Bestand."}
        </p>
    {:else}
        <Accordion>
            {#each openApplications as a (a.id)}
                {@render applicationItem(a)}
            {/each}
        </Accordion>
    {/if}

    {#if importedApplications.length > 0}
        <Heading tag="h2" class="text-xl font-semibold mt-8 mb-2">
            Übernommene Bewerbungen ({importedApplications.length})
        </Heading>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Alle Zählpunkte dieser Bewerbungen sind im Stammdaten-Bestand
            (EEG-Faktura-Import) - sie gelten damit als erledigt und bleiben
            als Nachweis der abgegebenen Erklärungen erhalten.
        </p>
        <Accordion>
            {#each importedApplications as a (a.id)}
                {@render applicationItem(a)}
            {/each}
        </Accordion>
    {/if}
</div>
