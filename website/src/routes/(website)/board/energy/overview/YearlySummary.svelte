<script>
    import {
        Card,
        Heading,
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";

    /** @type {{ yearlySums: any[] }} */
    let { yearlySums } = $props();

    const METRICS = [
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

    const years = [...new Set(yearlySums.map((it) => it.year))].sort();

    const mwhFor = (/** @type {any} */ year, /** @type {string} */ metricId) => {
        const row = yearlySums.find(
            (it) => it.year === year && it.description === metricId,
        );
        return row ? Number(row.mwh) : null;
    };

    // Arbeitspreis der EEG in €/MWh
    const pricePerMwh = (/** @type {any} */ year) =>
        ({ 2024: 110.0, 2025: 110.0, 2026: 100.0 })[String(year)] ?? 0;

    // Netzentgelt Arbeitspreis Netz OÖ in €/MWh, Mitglieder sparen davon 28 %
    // https://www.energiemagazin.at/netzkosten-in-oesterreich-2025-alle-bundeslaender-im-vergleich/
    const gridCostPerMwh = 81.6;

    const fmtMwh = (/** @type {number | null} */ v) =>
        v == null
            ? "–"
            : v.toLocaleString("de-AT", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
              });

    const fmtEur = (/** @type {number | null} */ v) =>
        v == null
            ? "–"
            : v.toLocaleString("de-AT", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
              });
</script>

<Card class="p-4 md:p-6" size="xl">
    <Heading tag="h2" class="text-xl font-semibold mb-4">
        Jahresübersicht
    </Heading>

    <div class="overflow-x-auto">
        <Table>
            <TableHead>
                <TableHeadCell>Jahr</TableHeadCell>
                {#each METRICS as metric}
                    <TableHeadCell class="text-right">
                        {metric.label} (MWh)
                    </TableHeadCell>
                {/each}
                <TableHeadCell class="text-right">Umsatz</TableHeadCell>
                <TableHeadCell class="text-right">
                    Netzkosten-Ersparnis
                </TableHeadCell>
            </TableHead>
            <TableBody>
                {#each years as year}
                    {@const distributed = mwhFor(
                        year,
                        "Eigendeckung gemeinschaftliche Erzeugung",
                    )}
                    <TableBodyRow>
                        <TableBodyCell>{year}</TableBodyCell>
                        {#each METRICS as metric}
                            <TableBodyCell class="text-right tabular-nums">
                                {fmtMwh(mwhFor(year, metric.id))}
                            </TableBodyCell>
                        {/each}
                        <TableBodyCell class="text-right tabular-nums">
                            {fmtEur(
                                distributed == null
                                    ? null
                                    : distributed * pricePerMwh(year),
                            )}
                        </TableBodyCell>
                        <TableBodyCell class="text-right tabular-nums">
                            {fmtEur(
                                distributed == null
                                    ? null
                                    : distributed * gridCostPerMwh * 0.28,
                            )}
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>

    <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
        Umsatz: Verteilte Energie × Arbeitspreis (2024/25: 110 €/MWh, ab 2026:
        100 €/MWh). Netzkosten-Ersparnis: 28 % des Netzentgelt-Arbeitspreises
        (81,6 €/MWh, Netz OÖ) auf die verteilte Energie.
    </p>
</Card>
