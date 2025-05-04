<script>
    import { Heading } from "flowbite-svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import PerformanceChart from "../../../../user/[memberId]/PerformanceChart.svelte";

    export let data;
</script>

<div class="text-center">
    <span class="text-primary-500 text-xs"
        >{`${data.user.name}, ${data.user.street} ${data.user.hnr}`}</span
    >
</div>

{#if data.metricsTimestampRange}
    <PerformanceChart bind:data />
{:else}
    no data
{/if}
