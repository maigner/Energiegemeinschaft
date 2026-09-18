<script>
    import { Heading, Spinner, Alert } from "flowbite-svelte";
    import Calculator from "./Calculator.svelte";

    let { data } = $props();
</script>

<svelte:head>
    <title>ISCHLSTROM - Speicherrechner</title>
</svelte:head>

<div class="text-center">
    <Heading tag="h4" class="text-primary-600 mt-2">Speicherrechner</Heading>
    <span class="text-primary-500 text-xs"
        >{`${data.user.name}, ${data.user.street} ${data.user.hnr}`}</span
    >
</div>

<div class="max-w-5xl mx-auto px-4 pb-12">
    <p class="text-sm text-gray-600 dark:text-gray-300 my-4">
        Welche Speichergröße passt zu Ihrer Anlage? Der Rechner spielt Ihre
        eigenen Viertelstundenwerte der letzten zwölf Monate mit
        unterschiedlich großen Batterien durch: Überschuss laden, den
        eigenen Bezug decken, auf Wunsch den Rest im Dunkeln an die
        Gemeinschaft abgeben und Bezugsspitzen kappen.
    </p>

    {#await data.series}
        <div class="flex items-center justify-center gap-3 py-16 text-gray-500">
            <Spinner size="6" /> Ihre Messwerte werden geladen …
        </div>
    {:then series}
        {#if !series}
            <Alert color="blue">
                Für diesen Standort liegen noch keine Messwerte vor. Sobald
                der Netzbetreiber Daten liefert, steht der Rechner zur
                Verfügung.
            </Alert>
        {:else if 'failed' in series}
            <Alert color="red">
                Die Messwerte konnten nicht geladen werden. Bitte versuchen
                Sie es später noch einmal.
            </Alert>
        {:else if !series.hasGeneration}
            <Alert color="blue">
                Der Speicherrechner braucht einen Einspeisezählpunkt in der
                Gemeinschaft. Für diesen Standort ist keiner aktiv.
            </Alert>
        {:else if !series.hasConsumption}
            <Alert color="blue">
                Für diesen Standort nimmt nur der Einspeisezählpunkt an der
                Gemeinschaft teil. Ohne die Werte des Bezugszählpunkts lässt
                sich nicht rechnen, was ein Speicher ersetzen würde.
            </Alert>
        {:else}
            {#key data.user.identifier}
                <Calculator {series} />
            {/key}
        {/if}
    {/await}
</div>
