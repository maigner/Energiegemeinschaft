<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import Weather from "./Weather.svelte";
    import Energy from "./Energy.svelte";
	/** @type {import('./$types').PageProps} */
    let { data } = $props();
</script>


<Energy communityMembers={data.communityMembers} />

<Weather forecast={data.forecast} />


<JsonView json={data.communityMembers} />
