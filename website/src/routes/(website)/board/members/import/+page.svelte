<script>
    import { Heading } from "flowbite-svelte";

    let { data } = $props();

    /** @param {string | null | undefined} iso */
    const formatDateTime = (iso) => iso
        ? new Date(iso).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "medium", timeStyle: "short" })
        : "unbekannt";
    /** @param {string} isoDate JJJJ-MM-TT */
    const formatDate = (isoDate) => {
        const [y, m, d] = isoDate.split("-");
        return `${d}.${m}.${y}`;
    };

    const lastmod = $derived(formatDateTime(data.file.lastmod));
    const podlist = $derived(data.podlist);
    const podlistProblems = $derived(
        podlist.unknownIdentifiers.length + podlist.activeWithoutPodlist.length + podlist.endedByGrid.length
    );
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

    {#if data.conflicts.length > 0}
        <div class="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            <p class="mb-2 font-semibold">
                {data.conflicts.length === 1 ? 'Eine Mitgliedsnummer ist' : `${data.conflicts.length} Mitgliedsnummern sind`}
                in der Datei für verschiedene Personen vergeben. Diese Nummern wurden samt
                Zählpunkten nicht importiert. Bitte in EEG-Faktura eigene Nummern vergeben
                und die Datei neu exportieren.
            </p>
            <ul class="list-disc pl-5 font-mono">
                {#each data.conflicts as conflict}
                    <li class="py-0.5">{conflict}</li>
                {/each}
            </ul>
        </div>
    {/if}

    <Heading tag="h5" class="mb-2">Zählpunktliste von Netz OÖ (Podlist)</Heading>

    {#if podlist.latest?.status === 'error'}
        <div class="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            <p class="font-semibold">Die zuletzt erhaltene Zählpunktliste ({formatDateTime(podlist.latest.receivedAt)}) konnte nicht übernommen werden.</p>
            <p class="font-mono">{podlist.latest.error}</p>
        </div>
    {/if}

    {#if podlist.current}
        <p class="mb-1 text-sm text-gray-700 dark:text-gray-300">
            Aktuelle Liste: <span class="font-mono">{podlist.current.fileName}</span>,
            angefordert {formatDateTime(podlist.current.requestedAt)},
            übernommen {formatDateTime(podlist.current.receivedAt)},
            {podlist.current.rowCount} Zeilen.
        </p>
        <p class="mb-4 text-sm text-gray-700 dark:text-gray-300">
            Neue Listen in EEG-Faktura anfordern; die Mail an info@ischlstrom.org wird
            alle 10 Minuten automatisch übernommen.
        </p>

        {#if podlistProblems === 0}
            <p class="mb-6 text-sm text-green-700 dark:text-green-400">
                Alle aktiven Zählpunkte stehen in der Liste, alle Zählpunkte der Liste sind bekannt.
            </p>
        {:else}
            <div class="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                {#if podlist.activeWithoutPodlist.length > 0}
                    <p class="mb-1 font-semibold">Bei uns aktiv, aber nicht in der Liste von Netz OÖ ({podlist.activeWithoutPodlist.length}):</p>
                    <ul class="mb-3 list-disc pl-5 font-mono">
                        {#each podlist.activeWithoutPodlist as item}
                            <li class="py-0.5">{item.identifier} (Mitglied {item.memberNumber})</li>
                        {/each}
                    </ul>
                {/if}
                {#if podlist.endedByGrid.length > 0}
                    <p class="mb-1 font-semibold">Laut Netz OÖ beendet, bei uns noch aktiv ({podlist.endedByGrid.length}):</p>
                    <ul class="mb-3 list-disc pl-5 font-mono">
                        {#each podlist.endedByGrid as item}
                            <li class="py-0.5">{item.identifier} (Mitglied {item.memberNumber}, aktiv bis {formatDate(item.activeUntil)})</li>
                        {/each}
                    </ul>
                {/if}
                {#if podlist.unknownIdentifiers.length > 0}
                    <p class="mb-1 font-semibold">In der Liste, aber nicht in unseren Stammdaten ({podlist.unknownIdentifiers.length}):</p>
                    <ul class="list-disc pl-5 font-mono">
                        {#each podlist.unknownIdentifiers as identifier}
                            <li class="py-0.5">{identifier}</li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {/if}
    {:else}
        <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Noch keine Zählpunktliste übernommen. In EEG-Faktura anfordern; die Mail an
            info@ischlstrom.org wird alle 10 Minuten automatisch übernommen.
        </p>
    {/if}

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
