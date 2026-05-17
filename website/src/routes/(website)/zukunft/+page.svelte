<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import CloudDayChart from "./CloudDayChart.svelte";
    import { Heading } from "flowbite-svelte";
    import OpenhabDayChart from "./OpenhabChart.svelte";
    import { formatDate } from "$lib/format";
    import OpenhabChart from "./OpenhabChart.svelte";

    let { data } = $props();

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

    const colours = {
        Fronius_Symo_Inverter_Solar_Plant_Power: "#F59E0B", // orange
        Fronius_Symo_Inverter_Grid_Power: "#3B82F6", // blue
        Fronius_Symo_Inverter_Battery_State_of_Charge: "#10B981", // green
    };

    //TODO: refactor all charts to start and end timestamps instead of date

    // refactor: instead of today, yesterday, dayBeforeYesterday, tomorrow,
    //  just pass an end day that is now and a start day that is 4 days in the past
</script>

<Heading tag="h2" class="mt-8 text-center"
    >{formatDate(startDate)} bis {formatDate(endDate)}</Heading
>

<Heading tag="h3">Wolken</Heading>
<CloudDayChart
    {startDate}
    {endDate}
    forecast={data.forecast.filter(
        (e) => e.time >= startDate.getTime() && e.time <= endDate.getTime(),
    )}
/>

{#each data.openhabUsers as user}
    <Heading tag="h3">Member {user.memberIdentifier}</Heading>
    <OpenhabChart
        {startDate}
        {endDate}
        memberIdentifier={user.memberIdentifier}
        itemName={"Fronius_Symo_Inverter_Solar_Plant_Power"}
        colour={colours.Fronius_Symo_Inverter_Solar_Plant_Power}
        ymin={0}
    />
    <OpenhabChart
        {startDate}
        {endDate}
        memberIdentifier={user.memberIdentifier}
        itemName={"Fronius_Symo_Inverter_Grid_Power"}
        colour={colours.Fronius_Symo_Inverter_Grid_Power}
    />
    <OpenhabChart
        {startDate}
        {endDate}
        memberIdentifier={user.memberIdentifier}
        itemName={"Fronius_Symo_Inverter_Battery_State_of_Charge"}
        colour={colours.Fronius_Symo_Inverter_Battery_State_of_Charge}
        ymin={0}
        ymax={100}
    />
{/each}
