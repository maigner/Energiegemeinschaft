<script>
    import { Card, Heading, P, Badge } from "flowbite-svelte";
    import {
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";
    import { formatDate } from "$lib/format";
    import ForecastChart from "./ForecastChart.svelte";
    import AccuracyChart from "./AccuracyChart.svelte";

    /** @type {{ data: { run: any, hours: any[], days: any[], accuracy: any[] } }} */
    let { data } = $props();

    const weekdays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const kwh = (/** @type {number} */ value) =>
        Number(value ?? 0).toLocaleString("de-AT", { maximumFractionDigits: 0 });

    const today = data.days?.[0] ?? null;
    const coverage = today
        ? (100 * today.self_coverage_kwh) / today.consumption_kwh
        : null;

    // mittlerer absoluter Fehler der bereits überprüfbaren Tage
    const accuracySummary = (() => {
        if (!data.accuracy?.length) return null;
        const mean = (/** @type {number[]} */ values) =>
            values.reduce((sum, value) => sum + value, 0) / values.length;
        const error = (/** @type {string} */ key) =>
            mean(
                data.accuracy.map((e) =>
                    Math.abs(e[`${key}_forecast`] - e[`${key}_actual`]),
                ),
            ) / mean(data.accuracy.map((e) => e[`${key}_actual`]));
        return {
            days: data.accuracy.length,
            consumption: 100 * error("consumption"),
            generation: 100 * error("generation"),
            from: data.accuracy[0].day,
            to: data.accuracy[data.accuracy.length - 1].day,
            // nachträglich gerechnete Läufe kennen das Wetter, das wirklich
            // eingetreten ist -- sie fallen deshalb etwas zu gut aus
            hasHindcast: data.accuracy.some((e) =>
                String(e.model_version).includes("hindcast"),
            ),
        };
    })();
</script>

<svelte:head>
    <title>Vorhersage | ISCHLSTROM</title>
    <meta
        name="description"
        content="Prognose von Verbrauch und gemeinschaftlicher Erzeugung der Energiegemeinschaft ISCHLSTROM für die nächsten Tage."
    />
</svelte:head>

<Heading tag="h3" class="mt-8 text-center">Vorhersage</Heading>

{#if !data.run}
    <P class="mt-6 text-center">
        Zurzeit liegt keine Prognose vor. Sie wird nach jedem Import der
        Messdaten neu berechnet.
    </P>
{:else}
    <P class="mx-auto mt-4 max-w-3xl text-center">
        So viel Strom wird unsere Gemeinschaft in den nächsten Tagen
        voraussichtlich verbrauchen und erzeugen. Die Prognose rechnet aus
        Wettervorhersage, Jahreszeit und Tagesrhythmus — die tatsächlichen
        Messwerte treffen erst Wochen später ein.
    </P>

    {#if today}
        <div class="mx-auto mt-6 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            <Card class="p-4 text-center">
                <span class="text-sm text-gray-500 dark:text-gray-400">Verbrauch heute</span>
                <span class="text-2xl font-bold">{kwh(today.consumption_kwh)} kWh</span>
            </Card>
            <Card class="p-4 text-center">
                <span class="text-sm text-gray-500 dark:text-gray-400">Erzeugung heute</span>
                <span class="text-2xl font-bold">{kwh(today.generation_kwh)} kWh</span>
            </Card>
            <Card class="p-4 text-center">
                <span class="text-sm text-gray-500 dark:text-gray-400">aus der Gemeinschaft</span>
                <span class="text-2xl font-bold">{kwh(today.self_coverage_kwh)} kWh</span>
            </Card>
            <Card class="p-4 text-center">
                <span class="text-sm text-gray-500 dark:text-gray-400">Deckungsgrad</span>
                <span class="text-2xl font-bold">{coverage?.toFixed(0)} %</span>
            </Card>
        </div>
    {/if}

    <Heading tag="h4" class="mt-10 text-center">Die nächsten sieben Tage</Heading>
    <div class="mt-4">
        <ForecastChart hours={data.hours} />
    </div>

    <Heading tag="h4" class="mt-10 text-center">Tagesübersicht</Heading>
    <div class="mx-auto mt-4 max-w-4xl">
        <Table striped={true}>
            <TableHead>
                <TableHeadCell>Tag</TableHeadCell>
                <TableHeadCell class="text-right">Verbrauch</TableHeadCell>
                <TableHeadCell class="text-right">Erzeugung</TableHeadCell>
                <TableHeadCell class="text-right">aus der Gemeinschaft</TableHeadCell>
                <TableHeadCell class="text-right">Deckung</TableHeadCell>
            </TableHead>
            <TableBody>
                {#each data.days as day}
                    <TableBodyRow>
                        <TableBodyCell>
                            {weekdays[new Date(day.day).getDay()]}, {formatDate(new Date(day.day))}
                        </TableBodyCell>
                        <TableBodyCell class="text-right">{kwh(day.consumption_kwh)} kWh</TableBodyCell>
                        <TableBodyCell class="text-right">{kwh(day.generation_kwh)} kWh</TableBodyCell>
                        <TableBodyCell class="text-right">{kwh(day.self_coverage_kwh)} kWh</TableBodyCell>
                        <TableBodyCell class="text-right">
                            {((100 * day.self_coverage_kwh) / day.consumption_kwh).toFixed(0)} %
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>

    {#if data.accuracy?.length}
        <Heading tag="h4" class="mt-12 text-center">Wie gut war die Prognose?</Heading>
        <P class="mx-auto mt-4 max-w-3xl text-center">
            Für diese Tage sind die echten Messwerte inzwischen eingetroffen —
            hier steht, was vorher prognostiziert wurde, neben dem, was
            tatsächlich gemessen wurde.
        </P>
        {#if accuracySummary}
            <div class="mt-4 flex justify-center gap-3">
                <Badge large color="blue">
                    Verbrauch: {accuracySummary.consumption.toFixed(0)} % Abweichung
                </Badge>
                <Badge large color="yellow">
                    Erzeugung: {accuracySummary.generation.toFixed(0)} % Abweichung
                </Badge>
                <Badge large color="gray">{accuracySummary.days} Tage</Badge>
            </div>
        {/if}
        <div class="mt-4">
            <AccuracyChart accuracy={data.accuracy} />
        </div>
        {#if accuracySummary?.hasHindcast}
            <P class="mx-auto mt-3 max-w-3xl text-center text-sm text-gray-500 dark:text-gray-400">
                Ein Teil dieser Tage wurde nachträglich durchgerechnet: das
                Modell hat dabei zwar nur Messdaten von vor dem jeweiligen Tag
                gesehen, aber das tatsächlich eingetretene Wetter statt einer
                Wettervorhersage. Diese Tage fallen daher etwas zu gut aus.
            </P>
        {/if}
    {/if}

    <P class="mx-auto mt-10 max-w-3xl text-center text-sm text-gray-500 dark:text-gray-400">
        Prognose vom {formatDate(new Date(data.run.created_at))}, gerechnet mit
        Messdaten bis {formatDate(new Date(data.run.data_until))}. Wetterdaten von
        Open-Meteo. Eine Prognose bleibt eine Schätzung — vor allem die Erzeugung
        hängt am Wetter und wird mit jedem Tag Vorlauf unsicherer.
    </P>
{/if}
