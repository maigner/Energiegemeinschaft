<script>
    import Navigation from "./Navigation.svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";

    export let data;

    if (browser) {
        if (!data.users) {
            goto("/login");
        }
    }
</script>

<Navigation {data} />

{#if data.users}
    <slot />
{/if}
