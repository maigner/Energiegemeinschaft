<script>
    import { Input, Label, Helper } from "flowbite-svelte";

    let { accountName = $bindable() } = $props();
</script>

<div class="mt-4">
    <Label for="account_name" class="mb-2">Konto lautend auf</Label>
    <Input type="text" id="account_name" bind:value={accountName} required />
    {#if accountName === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium"
                >Bitte geben Sie den Verfügernamen Ihres Kontos an.</span
            >
        </Helper>
    {/if}
</div>
