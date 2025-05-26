<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import WeeklySumsChart from "./WeeklySumsChart.svelte";
    import DailySumsChart from "./DailySumsChart.svelte";
    export let data;
</script>

<WeeklySumsChart bind:data />

<DailySumsChart bind:data />