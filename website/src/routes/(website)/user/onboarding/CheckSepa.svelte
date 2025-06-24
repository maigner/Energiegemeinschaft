<script>
    import { Checkbox, Helper } from "flowbite-svelte";

    let { checkSepa = $bindable() } = $props();

    let boxColor = $state("bg-yellow-300");

    $effect(() => {
        boxColor = checkSepa ? "bg-green-300" : "bg-yellow-300";
    });
</script>

<div class={boxColor + " rounded-md p-4 mt-4"}>
    <Checkbox bind:checked={checkSepa}
        >Ich stimme dem automatischen SEPA Bankeinzug zu</Checkbox
    >
    {#if checkSepa === false}
        <Helper class="mt-2" color="red">
            <span class="font-medium"
                >Eine Teilname ohne SEPA Bankeinzug ist leider nicht möglich.</span
            >
        </Helper>
    {/if}
</div>
