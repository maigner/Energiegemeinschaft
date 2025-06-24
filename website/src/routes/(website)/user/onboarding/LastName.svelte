<script>
    import { Input, Label, Helper } from "flowbite-svelte";

     let {lastName = $bindable()} = $props();
</script>

<div class="mt-4">
    <Label for="lastName" class="mb-2">Nachname</Label>
    <Input type="text" id="lastName" bind:value={lastName} required />
    {#if lastName === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie Ihren Nachnamen an.</span>
        </Helper>
    {/if}
</div>
