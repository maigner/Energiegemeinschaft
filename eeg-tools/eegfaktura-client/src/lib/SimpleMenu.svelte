<script lang="ts">
    import { List, Li, A } from "flowbite-svelte";

    let { items } = $props();
</script>

<List tag="dl" class="mb-6 flex flex-wrap items-center justify-center">
    {#each items as item}
        <Li>
            <A
                href={item.href}
                class="me-4 text-gray-700 hover:underline md:me-6 dark:text-white"
                >{item.display}</A
            >
        </Li>
    {/each}
</List>
