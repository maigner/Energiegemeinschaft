<script>
    import { Heading } from "flowbite-svelte";

    let { data } = $props();
</script>

<svelte:head>
    <title>ISCHLSTROM - Stammdaten-Import</title>
</svelte:head>

<div class="px-4 mt-4 max-w-4xl mx-auto">
    <Heading tag="h4" class="mb-4">Neu aufgenommene Datensätze</Heading>

    {#if data.messages.length > 0}
        <ul class="divide-y divide-gray-200 dark:divide-gray-700 font-mono text-sm">
            {#each data.messages as message}
                <li class="py-2">{message}</li>
            {/each}
        </ul>
    {:else}
        <p class="text-gray-500 dark:text-gray-400">
            Keine neuen Datensätze — alle Einträge waren bereits vorhanden.
        </p>
    {/if}
</div>
