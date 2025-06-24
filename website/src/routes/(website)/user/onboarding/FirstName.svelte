<script>
    import { Input, Label, Helper } from "flowbite-svelte";

     let {firstName = $bindable()} = $props();
</script>

<div class="mt-4">
    <Label for="first_name" class="mb-2">Vorname</Label>
    <Input type="text" id="first_name" bind:value={firstName} required />
    {#if firstName === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie Ihren Vornamen an.</span>
        </Helper>
    {/if}
</div>
