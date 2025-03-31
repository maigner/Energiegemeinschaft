<script>
    import { formatIBAN, isValidIBAN } from "$lib/iban";
    import { Input, Label, Helper } from "flowbite-svelte";
    /**
     * @type {string}
     */
    export let iban;

    

    $: iban = formatIBAN(iban);
</script>

<div class="mt-4">
    <Label for="iban" class="mb-2">IBAN</Label>
    <Input type="text" id="iban" bind:value={iban} required />
    {#if isValidIBAN(iban) === false}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie Ihre IBAN an.</span>
        </Helper>
    {/if}
</div>
