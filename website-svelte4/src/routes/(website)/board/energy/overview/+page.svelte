<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import WeeklySumsChart from "./WeeklySumsChart.svelte";
    export let data;
</script>

<WeeklySumsChart bind:data />