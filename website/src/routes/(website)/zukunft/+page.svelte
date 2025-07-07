<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import Weather from "./Weather.svelte";
	/** @type {import('./$types').PageProps} */
    let { data } = $props();
</script>

<JsonView json={data.communityMembers} />

<Weather forecast={data.forecast} />