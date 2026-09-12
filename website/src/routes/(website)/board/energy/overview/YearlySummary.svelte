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
    import { tariffFor, gridSavingCt, fmtCt } from "$lib/tariffs";

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

    // Preise je Jahr aus $lib/tariffs.js (ct/kWh = €/MWh / 10)
    const pricePerMwh = (/** @type {any} */ year) =>
        tariffFor(year).eeg.purchaseCt * 10;

    // Netzkosten-Ersparnis je MWh: Rabatt der regionalen EEG auf den
    // Netznutzungs-Arbeitspreis Netz OÖ, Netzebene 7
    const gridSavingPerMwh = (/** @type {any} */ year) =>
        gridSavingCt(tariffFor(year)) * 10;

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
                                    : distributed * gridSavingPerMwh(year),
                            )}
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>

    <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
        Umsatz: verteilte Energie × Bezugstarif der EEG. Netzkosten-Ersparnis:
        Rabatt der regionalen EEG auf den Netznutzungs-Arbeitspreis von Netz OÖ
        (Netzebene 7, ohne Leistungsmessung) für die verteilte Energie. Je Jahr:
        {#each years as year, i}
            {@const t = tariffFor(year)}
            {i > 0 ? "; " : ""}{year}: Bezug {fmtCt(t.eeg.purchaseCt)} ct/kWh,
            Netz {fmtCt(t.grid.usageCt)} ct/kWh, Rabatt {t.rebate.regionalPct}%
        {/each}. Quelle der Werte: src/lib/tariffs.js.
    </p>
</Card>
