<script>

    import Navigation from "./Navigation.svelte";

    export let data;
</script>

<Navigation bind:data />

<slot />
