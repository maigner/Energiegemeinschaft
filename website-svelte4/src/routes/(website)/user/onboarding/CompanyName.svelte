<script>
    import { Input, Label, Helper } from "flowbite-svelte";
    /**
     * @type {string}
     */
     export let companyName;
</script>

<div class="mt-4">
    <Label for="companyName" class="mb-2">Firmenname</Label>
    <Input type="text" id="companyName" bind:value={companyName} required />
    {#if companyName === ""}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Bitte geben Sie Ihren Firmennamen an.</span>
        </Helper>
    {/if}
</div>
