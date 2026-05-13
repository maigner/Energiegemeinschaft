<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import CloudDayChart from "./CloudDayChart.svelte";
    import { Heading } from "flowbite-svelte";
    import OpenhabDayChart from "./OpenhabDayChart.svelte";

    let { data } = $props();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
    dayBeforeYesterday.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    function startAndEndOfDate(date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }


</script>





<Heading tag="h2">Morgen</Heading>
<CloudDayChart
    date={tomorrow}
    forecast={data.forecast.filter((e) => e.time >= startAndEndOfDate(tomorrow).start && e.time <= startAndEndOfDate(tomorrow).end)}
/>

<Heading tag="h2">Heute</Heading>

<CloudDayChart
    date={today}
    forecast={data.forecast.filter((e) => e.time >= startAndEndOfDate(today).start && e.time <= startAndEndOfDate(today).end)}
/>
<Heading tag="h3">Member {data.openhabUsers[0].memberIdentifier}</Heading>
<OpenhabDayChart
    date={today}
    memberIdentifier={data.openhabUsers[0].memberIdentifier}
    itemName={"Fronius_Symo_Inverter_Solar_Plant_Power"}
/>
<Heading tag="h3">Member {data.openhabUsers[1].memberIdentifier}</Heading>
<OpenhabDayChart
    date={today}
    memberIdentifier={data.openhabUsers[1].memberIdentifier}
    itemName={"Fronius_Symo_Inverter_Solar_Plant_Power"}
/>

<Heading tag="h2">Gestern</Heading>

<CloudDayChart
    date={yesterday}
    forecast={data.forecast.filter((e) => e.time >= startAndEndOfDate(yesterday).start && e.time <= startAndEndOfDate(yesterday).end)}
/>
<Heading tag="h3">Member {data.openhabUsers[0].memberIdentifier}</Heading>
<OpenhabDayChart
    date={yesterday}
    memberIdentifier={data.openhabUsers[0].memberIdentifier}
    itemName={"Fronius_Symo_Inverter_Solar_Plant_Power"}
/>
<Heading tag="h3">Member {data.openhabUsers[1].memberIdentifier}</Heading>
<OpenhabDayChart
    date={yesterday}
    memberIdentifier={data.openhabUsers[1].memberIdentifier}
    itemName={"Fronius_Symo_Inverter_Solar_Plant_Power"}
/>


<Heading tag="h2">Vorgestern</Heading>

<CloudDayChart
    date={dayBeforeYesterday}
    forecast={data.forecast.filter((e) => e.time >= startAndEndOfDate(dayBeforeYesterday).start && e.time <= startAndEndOfDate(dayBeforeYesterday).end)}
/>
<Heading tag="h3">Member {data.openhabUsers[0].memberIdentifier}</Heading>

<OpenhabDayChart
    date={dayBeforeYesterday}
    memberIdentifier={data.openhabUsers[0].memberIdentifier}
    itemName={"Fronius_Symo_Inverter_Solar_Plant_Power"}
/>
<Heading tag="h3">Member {data.openhabUsers[1].memberIdentifier}</Heading>

<OpenhabDayChart
    date={dayBeforeYesterday}
    memberIdentifier={data.openhabUsers[1].memberIdentifier}
    itemName={"Fronius_Symo_Inverter_Solar_Plant_Power"}
/>

