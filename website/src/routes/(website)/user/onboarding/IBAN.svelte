<script>
    import { formatIBAN, isValidIBAN } from "$lib/iban";
    import { Input, Label, Helper } from "flowbite-svelte";

    let { iban = $bindable() } = $props();

    $effect(() => {
        iban = formatIBAN(iban);
    });
</script>

<div class="mt-4">
    <Label for="iban" class="mb-2">IBAN</Label>
    <Input type="text" id="iban" bind:value={iban} required />
    <!-- Fehler erst zeigen, wenn schon etwas eingegeben wurde -->
    {#if iban !== "" && isValidIBAN(iban) === false}
        <Helper class="mt-2" color="red">
            <span class="font-medium"
                >Bitte geben Sie eine gültige IBAN ein.</span
            >
        </Helper>
    {/if}
</div>
