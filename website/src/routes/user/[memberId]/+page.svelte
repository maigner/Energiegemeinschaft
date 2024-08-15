<script>
    import { Card, Heading } from "flowbite-svelte";
    import PerformanceChart from "./PerformanceChart.svelte";

    export let data;
</script>

<div class="text-center">
    <Heading tag="h4" class="text-primary-600 mt-2">Meine Daten</Heading>

    <span class="text-primary-500 text-xs"
        >{`${data.user.name}, ${data.user.street} ${data.user.hnr}`}</span
    >
</div>

<PerformanceChart bind:data />
