<script>
    import { Card, Button, Toggle } from "flowbite-svelte";

    /**
     * @type {string}
     */
     export let img;
</script>

<div>
    <Card {img} class="m-2" size="xl">
        <h5
            class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
        >
            <slot name="title" />
        </h5>
        <p><slot name="subtitle" /></p>
        <p
            class="mb-3 font-normal text-gray-700 dark:text-gray-400 leading-tight"
        >
            <slot name="content" />
        </p>
        <Button>
            Mehr erfahren
        </Button>
    </Card>
</div>

<style>
</style>
