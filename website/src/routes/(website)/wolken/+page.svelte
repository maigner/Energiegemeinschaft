<script>
    import CloudDayChart from "./CloudDayChart.svelte";
    import { Heading } from "flowbite-svelte";
    import { formatDate } from "$lib/format";

    let { data } = $props();

    const today = new Date();
    const startDate = new Date();; //new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000); // yesterday
    const endDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days ahead



</script>



<Heading tag="h3" class="mt-8 text-center">Wolken über ISCHSTROM</Heading>
<Heading tag="h4" class="mt-8 text-center"
    >{formatDate(startDate)} bis {formatDate(endDate)}</Heading
>
<CloudDayChart
    {startDate}
    {endDate}
    forecast={data.forecast.filter(
        (e) => e.time >= startDate.getTime() && e.time <= endDate.getTime(),
    )}
/>


