<script>
    import { Checkbox, Helper } from "flowbite-svelte";

    /**
     * @type {boolean}
     */
     export let dataProcessing;

    let boxColor = "bg-yellow-300";

    $: boxColor = dataProcessing ? "bg-green-300" : "bg-yellow-300";

</script>

<div class={boxColor + " rounded-md p-4 mt-4"}>
    <Checkbox bind:checked={dataProcessing}>Ich stimme der Verarbeitung meiner Daten zu</Checkbox>
    {#if dataProcessing === false}
        <Helper class="mt-2" color="red">
            <span class="font-medium">Eine Teilname ohne Ihrer Zustimmung ist leider nicht möglich.</span>
        </Helper>
    {/if}
</div>
