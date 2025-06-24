<script>
    import { Card, Button } from "flowbite-svelte";

    let { img, showMore = true} = $props();
</script>

<div class="min-w-fit">
    <Card {img} class="m-2 max-w-3xl mb-10" size="xl">
        <h5
            class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
        >
            {@render title()}
        </h5>
        <p>{@render subtitle()}</p>
        <p
            class="mb-3 font-normal text-gray-700 dark:text-gray-400 leading-tight"
        >
            {@render content()}
        </p>
        {#if showMore}
            <Button
                onclick={() => {
                    alert("Kommt bald...");
                }}>Mehr erfahren</Button
            >
        {/if}
    </Card>
</div>

<style>
</style>
