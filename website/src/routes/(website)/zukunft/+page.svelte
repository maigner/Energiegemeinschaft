<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import Weather from "./Clouds.svelte";
    import Energy from "./Energy.svelte";
    import DayComparison from "./DayComparison.svelte";
    import Clouds from "./Clouds.svelte";
    /** @type {import('./$types').PageProps} */
    let { data } = $props();
</script>

<!--
<Energy communityMembers={data.communityMembers} />

-->


<Clouds forecast={data.forecast} />

<JsonView json={data.openhabUsers} />


<!--
<DayComparison
    communityMembers={data.communityMembers}
    date={new Date("2024-04-18")}
    forecast={data.forecast}
/>
-->