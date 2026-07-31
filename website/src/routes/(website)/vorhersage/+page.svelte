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

    // null statt Division durch 0 (z.B. Erzeugung an trüben Wintertagen)
    const percent = (/** @type {number} */ part, /** @type {number} */ total) =>
        Number(total) > 0 ? (100 * Number(part ?? 0)) / Number(total) : null;
    const formatPercent = (/** @type {number | null} */ value) =>
        value === null ? "-" : `${value.toFixed(0)}%`;

    const today = data.days?.[0] ?? null;
    // Verbrauchersicht: Anteil des Verbrauchs, der aus der Gemeinschaft kommt
    const todayCoverage = today
        ? percent(today.self_coverage_kwh, today.consumption_kwh)
        : null;
    // Erzeugersicht: Anteil der Erzeugung, den die Gemeinschaft abnimmt
    const todayUptake = today
        ? percent(today.self_coverage_kwh, today.generation_kwh)
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
            // Tage, die beim Rechnen schon vorbei waren, kennen das Wetter, das
            // wirklich eingetreten ist -- sie fallen deshalb etwas zu gut aus
            measuredWeatherDays: data.accuracy.filter(
                (e) => e.used_measured_weather,
            ).length,
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
        Wettervorhersage, Jahreszeit und Tagesrhythmus. Die tatsächlichen
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
                <span class="text-sm text-gray-500 dark:text-gray-400">Deckungsgrad</span>
                <span class="text-2xl font-bold">{formatPercent(todayCoverage)}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                    des Verbrauchs aus der Gemeinschaft
                </span>
            </Card>
            <Card class="p-4 text-center">
                <span class="text-sm text-gray-500 dark:text-gray-400">Abnahmegrad</span>
                <span class="text-2xl font-bold">{formatPercent(todayUptake)}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                    der Erzeugung bleibt in der Gemeinschaft
                </span>
            </Card>
        </div>
    {/if}

    <Heading tag="h4" class="mt-12 text-center">Was sagen diese Zahlen aus?</Heading>
    <P class="mx-auto mt-4 max-w-3xl text-center">
        Der Strom, der innerhalb der Gemeinschaft fließt, lässt sich aus zwei
        Blickwinkeln betrachten. Je nachdem, ob man Strom bezieht oder
        einspeist, interessiert eine andere Zahl.
    </P>
    <div class="mx-auto mt-6 grid max-w-4xl gap-4 md:grid-cols-2">
        <Card class="p-5" size="xl">
            <Heading tag="h5" class="text-blue-700 dark:text-blue-400">
                Für Verbraucher: der Deckungsgrad
            </Heading>
            <P class="mt-2 text-sm">
                Wie viel des Verbrauchs wird durch Strom aus der Gemeinschaft
                gedeckt? Dieser Anteil ist günstiger als Strom vom Lieferanten:
                Der Bezugstarif der Gemeinschaft liegt meist darunter, und als
                regionale EEG sparen wir zusätzlich 28% der Netzkosten
                für jede gemeinschaftlich verteilte kWh.
            </P>
            <P class="mt-2 text-sm">
                Ein hoher Deckungsgrad heißt also: kleinere Stromrechnung. Wer
                Geschirrspüler, Waschmaschine oder E-Auto in die sonnigen
                Mittagsstunden verlegt, hebt ihn spürbar an.
            </P>
            {#if today && todayCoverage !== null}
                <P class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Heute laut Prognose: {kwh(today.self_coverage_kwh)} von
                    {kwh(today.consumption_kwh)} kWh Verbrauch, also
                    {formatPercent(todayCoverage)}.
                </P>
            {/if}
        </Card>
        <Card class="p-5" size="xl">
            <Heading tag="h5" class="text-amber-600 dark:text-amber-400">
                Für Erzeuger: der Abnahmegrad
            </Heading>
            <P class="mt-2 text-sm">
                Wie viel der Erzeugung nehmen die Mitglieder tatsächlich ab?
                Für diesen Anteil zahlt die Gemeinschaft ihren Einspeisetarif,
                in der Regel mehr, als die Einspeisung ins öffentliche Netz
                bringt. Was die Gemeinschaft gerade nicht braucht, geht als
                Überschuss ins Netz.
            </P>
            <P class="mt-2 text-sm">
                Ein hoher Abnahmegrad heißt also: bessere Erlöse für die
                Einspeiser. Er steigt, wenn möglichst viel Verbrauch in die
                Stunden mit viel Sonne fällt.
            </P>
            {#if today && todayUptake !== null}
                <P class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Heute laut Prognose: {kwh(today.self_coverage_kwh)} von
                    {kwh(today.generation_kwh)} kWh Erzeugung, also
                    {formatPercent(todayUptake)}.
                </P>
            {/if}
        </Card>
    </div>
    <P class="mx-auto mt-4 max-w-3xl text-center text-sm text-gray-500 dark:text-gray-400">
        Die Interessen sind verschieden, das Rezept ist dasselbe: Je besser
        Verbrauch und Erzeugung zeitlich zusammenpassen, desto höher sind beide
        Werte, und desto mehr haben alle davon. Die aktuellen Tarife stehen in
        den <a href="/faq" class="underline">häufigen Fragen</a>.
    </P>

    <Heading tag="h4" class="mt-12 text-center">Die nächsten sieben Tage</Heading>
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
                <TableHeadCell class="text-right">Abnahme</TableHeadCell>
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
                            {formatPercent(percent(day.self_coverage_kwh, day.consumption_kwh))}
                        </TableBodyCell>
                        <TableBodyCell class="text-right">
                            {formatPercent(percent(day.self_coverage_kwh, day.generation_kwh))}
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    </div>

    {#if data.accuracy?.length}
        <Heading tag="h4" class="mt-12 text-center">Wie gut war die Prognose?</Heading>
        <P class="mx-auto mt-4 max-w-3xl text-center">
            Für diese Tage liegen inzwischen Messwerte vor. Hier steht, was
            vorher prognostiziert wurde, neben dem, was tatsächlich gemessen
            wurde.
        </P>
        {#if accuracySummary}
            <div class="mt-4 flex justify-center gap-3">
                <Badge large color="blue">
                    Verbrauch: {accuracySummary.consumption.toFixed(0)}% Abweichung
                </Badge>
                <Badge large color="yellow">
                    Erzeugung: {accuracySummary.generation.toFixed(0)}% Abweichung
                </Badge>
                <Badge large color="gray">{accuracySummary.days} Tage</Badge>
            </div>
        {/if}
        <div class="mt-4">
            <AccuracyChart accuracy={data.accuracy} />
        </div>
        {#if accuracySummary?.measuredWeatherDays}
            <P class="mx-auto mt-3 max-w-3xl text-center text-sm text-gray-500 dark:text-gray-400">
                Bei {accuracySummary.measuredWeatherDays} dieser {accuracySummary.days}
                Tage lag der Tag zum Zeitpunkt der Berechnung schon zurück. Die
                Messdaten dazu fehlten zwar noch, das Wetter war aber bereits
                bekannt. Diese Tage fallen etwas besser aus als eine echte
                Vorausschau.
            </P>
        {/if}
    {/if}

    <P class="mx-auto mt-10 max-w-3xl text-center text-sm text-gray-500 dark:text-gray-400">
        Prognose vom {formatDate(new Date(data.run.created_at))}, gerechnet mit
        Messdaten bis {formatDate(new Date(data.run.data_until))}. Wetterdaten von
        Open-Meteo. Eine Prognose bleibt eine Schätzung. Vor allem die Erzeugung
        hängt am Wetter und wird mit jedem Tag Vorlauf unsicherer.
    </P>
{/if}
