<script>
    import { Card, Heading } from "flowbite-svelte";
    import AverageMetricsChart from "./AverageMetricsChart.svelte";

    export let data;
</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-8">Meine Daten</Heading>

    <span class="text-primary-500 text-xs"
        >{`${data.user.name}, ${data.user.street} ${data.user.hnr}`}</span
    >
</div>

<Card class="max-w-full">
    <AverageMetricsChart
        data={{
            averageMetrics: data.averageMetrics,
            metricsTimestampRange: data.metricsTimestampRange,
        }}
    />
</Card>

