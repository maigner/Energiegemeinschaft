<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import WeeklySumsChart from "./WeeklySumsChart.svelte";
    import DailySumsChart from "./DailySumsChart.svelte";
    import YearlySummary from "./YearlySummary.svelte";
    let { data } = $props();
</script>

<YearlySummary yearlySums={data.yearlySums} />

<WeeklySumsChart bind:data />

<DailySumsChart bind:data />