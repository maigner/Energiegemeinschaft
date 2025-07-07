<script>

    import DayOfEnergyChart from "./DayOfEnergyChart.svelte";


    let { date, member } = $props();

    const today = date;
    today.setHours(0, 0, 0, 0); // set to 00:00:00.000

    const tomorrow = new Date(today); // same day
    tomorrow.setDate(tomorrow.getDate() + 1); // add 1 day
    tomorrow.setHours(0, 0, 0, 0); // reset to midnight



</script>

Energy {date}



<hr />

<!--
<DayOfEnergyChart date={today} member={member} />
-->
