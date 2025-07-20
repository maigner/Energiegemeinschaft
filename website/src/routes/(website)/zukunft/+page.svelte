<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import Weather from "./Weather.svelte";
    import Energy from "./Energy.svelte";
    import DayComparison from "./DayComparison.svelte";
    /** @type {import('./$types').PageProps} */
    let { data } = $props();
</script>

<!--
<Energy communityMembers={data.communityMembers} />

<Weather forecast={data.forecast} />
-->



<DayComparison
    communityMembers={data.communityMembers}
    date={new Date("2024-04-18")}
    forecast={data.forecast}
/>
