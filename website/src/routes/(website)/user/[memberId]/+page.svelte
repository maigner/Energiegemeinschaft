<script>
    import { Heading } from "flowbite-svelte";
    import PerformanceChart from "./PerformanceChart.svelte";
    import MemberInfoCard from "./MemberInfoCard.svelte";

    let { data } = $props();
</script>

<div class="text-center">
    <Heading tag="h4" class="text-primary-600 mt-2">Meine Energiedaten</Heading>

    <span class="text-primary-500 text-xs"
        >{`${data.user.name}, ${data.user.street} ${data.user.hnr}`}</span
    >
</div>

<!-- key: bei Standortwechsel (/user/5 -> /user/7) wird die Seitenkomponente
     wiederverwendet; der Chart muss dann mit den Daten des neuen Standorts
     neu aufgebaut werden -->
{#key data.user.identifier}
    <PerformanceChart {data} />
{/key}

<MemberInfoCard user={data.user} measurementPoints={data.measurementPoints} />
