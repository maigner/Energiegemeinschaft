<script>
    import { Checkbox, Helper } from "flowbite-svelte";

    let { privacyNotice = $bindable() } = $props();

    let boxColor = $state("bg-yellow-300");

    $effect(() => {
        boxColor = privacyNotice ? "bg-green-300" : "bg-yellow-300";
    });
</script>

<div class={boxColor + " rounded-md p-4 mt-4"}>
    <Checkbox bind:checked={privacyNotice}
        >Ich habe die <a
            class="underline"
            href="/datenschutz"
            target="_blank">Datenschutzerklärung</a
        > gelesen und zur Kenntnis genommen.</Checkbox
    >
    <Helper class="mt-2">
        Wir verarbeiten Ihre Angaben zur Begründung und Durchführung Ihrer
        Mitgliedschaft in der Energiegemeinschaft (Art. 6 Abs. 1 lit. b DSGVO).
    </Helper>
    {#if privacyNotice === false}
        <Helper class="mt-2" color="red">
            <span class="font-medium"
                >Bitte bestätigen Sie, dass Sie die Datenschutzerklärung gelesen
                haben.</span
            >
        </Helper>
    {/if}
</div>
