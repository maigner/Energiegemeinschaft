<script>
    import { Heading } from "flowbite-svelte";

    let { data } = $props();

    const lastmod = $derived(new Date(data.file.lastmod).toLocaleString("de-AT", {
        timeZone: "Europe/Vienna",
        dateStyle: "medium",
        timeStyle: "short"
    }));
</script>

<svelte:head>
    <title>ISCHLSTROM - Stammdaten-Import</title>
</svelte:head>

<div class="px-4 mt-4 max-w-4xl mx-auto">
    <Heading tag="h4" class="mb-2">Stammdaten-Import</Heading>

    <p class="mb-1 text-sm text-gray-700 dark:text-gray-300">
        Importierte Datei: <span class="font-mono">{data.file.name}</span>
        (hochgeladen {lastmod})
    </p>
    <p class="mb-6 text-sm text-gray-700 dark:text-gray-300">
        {data.counts.inserted} neu angelegt, {data.counts.updated} aktualisiert,
        {data.counts.skipped} übersprungen (Mitglieder und Zählpunkte).
    </p>

    <Heading tag="h5" class="mb-4">Neu aufgenommene Datensätze</Heading>

    {#if data.messages.length > 0}
        <ul class="divide-y divide-gray-200 dark:divide-gray-700 font-mono text-sm">
            {#each data.messages as message}
                <li class="py-2">{message}</li>
            {/each}
        </ul>
    {:else}
        <p class="text-gray-500 dark:text-gray-400">
            Keine neuen Datensätze. Alle Einträge der Datei waren bereits vorhanden
            (auch die Mitgliederliste importiert bei jedem Aufruf).
        </p>
    {/if}
</div>
