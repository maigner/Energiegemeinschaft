<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Heading } from "flowbite-svelte";
    import {
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";

    let { yearlySums } = $props();

    const uniqueYears = [...new Set(yearlySums.map((item) => item.year))].sort(
        (a, b) => a - b,
    );

    const metrics = [
        { id: "Gesamte gemeinschaftliche Erzeugung", label: "Erzeugung" },
        {
            id: "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung)",
            label: "Verbrauch",
        },
        { id: "Eigendeckung gemeinschaftliche Erzeugung", label: "Verteilt" },
        {
            id: "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
            label: "Überschuss",
        },
    ];

    function getEuroPerMegawattHour(year) {
        switch (year) {
            case "2024":
                return 110.0;
            case "2025":
                return 110.0;
            case "2026":
                return 95.0;
        }

        return 0.0;
    }

    function getTransportCostsPerMegawattHour(year) {

        // https://www.energiemagazin.at/netzkosten-in-oesterreich-2025-alle-bundeslaender-im-vergleich/
        const netzentgeltOOE = 81.6; 

        switch (year) {
            case "2024":
                return netzentgeltOOE;
            case "2025":
                return netzentgeltOOE;
            case "2026":
                return netzentgeltOOE;
        }

        return 0.0;
    }
</script>

<div class="w-full flex content-center flex-col mb-8">
    <Heading class="text-primary-700 text-center mb-6" tag="h6"
        >Jahresumsätze Energie</Heading
    >

    <Table>
        <TableHead>
            <TableHeadCell>Jahr</TableHeadCell>
            {#each metrics as metric}
                <TableHeadCell>{metric.label}</TableHeadCell>
            {/each}
        </TableHead>
        <TableBody>
            {#each uniqueYears as year}
                <TableBodyRow>
                    <TableBodyCell>{year}</TableBodyCell>
                    {#each metrics as metric}
                        {@const mwhValue = Number(
                            yearlySums.filter(
                                (item) =>
                                    item.year === year &&
                                    item.description === metric.id,
                            )[0].mwh,
                        )}
                        <TableBodyCell
                            >{mwhValue.toFixed(2)} MWh
                            {#if metric.label === "Verteilt"}
                                <div class="text-left">
                                    €
                                    {(
                                        mwhValue * getEuroPerMegawattHour(year)
                                    ).toFixed(2)}
                                </div>
                                <div class="text-left">
                                    28% Ersparnis: €
                                    {(
                                        (mwhValue * getTransportCostsPerMegawattHour(year)) / 100.0 * 28.0
                                    ).toFixed(2)}
                                </div>
                            {/if}
                        </TableBodyCell>
                    {/each}
                </TableBodyRow>
            {/each}
        </TableBody>
    </Table>
</div>
