<script>
    import Navigation from "./Navigation.svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";

    let { data, children } = $props();
</script>

<Navigation {data} />

{@render children()}
