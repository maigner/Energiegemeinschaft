<script>
    import { formatDate } from "$lib/format";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Heading } from "flowbite-svelte";
    import DayChart from "./DayChart.svelte";


    let { date, forecast } = $props();

    const today = date;
    today.setHours(0, 0, 0, 0); // set to 00:00:00.000

    const tomorrow = new Date(today); // same day
    tomorrow.setDate(tomorrow.getDate() + 1); // add 1 day
    tomorrow.setHours(0, 0, 0, 0); // reset to midnight

    const forecastToday = forecast.filter(
        (elem) => elem.time >= today && elem.time < tomorrow,
    );


</script>

{forecastToday[0].time}

<DayChart date={today} forecast={forecastToday} />

