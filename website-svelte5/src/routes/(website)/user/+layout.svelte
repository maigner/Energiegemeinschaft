<script>
    import Navigation from "./Navigation.svelte";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";

    export let data;

    
</script>

<Navigation {data} />

<slot />
