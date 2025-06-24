<script>
    import { Input, Label, Helper } from "flowbite-svelte";

    let { address = $bindable() } = $props();
</script>

<div class="mt-4">
    <Label for="street" class="mb-2">Straße</Label>
    <Input type="text" id="street" bind:value={address.street} required />
    {#if address.street === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie die Straße an.</span>
        </Helper>
    {/if}
</div>
<div class="mt-4">
    <Label for="number" class="mb-2">Hausnummer</Label>
    <Input type="text" id="number" bind:value={address.number} required />
    {#if address.number === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie die Hausnummer an.</span>
        </Helper>
    {/if}
</div>
<div class="mt-4">
    <Label for="zipCode" class="mb-2">Postleitzahl</Label>
    <Input type="text" id="zipCode" bind:value={address.zipCode} required />
    {#if address.zipCode === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie die Postleitzahl an.</span
            >
        </Helper>
    {/if}
</div>
<div class="mt-4">
    <Label for="city" class="mb-2">Ort</Label>
    <Input type="text" id="city" bind:value={address.city} required />
    {#if address.city === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie den Ortsname an.</span>
        </Helper>
    {/if}
</div>
