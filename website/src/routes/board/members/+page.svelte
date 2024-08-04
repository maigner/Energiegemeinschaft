<script>
    import Project from "$lib/Project.svelte";
    import MeasurementPoints from "./MeasurementPoints.svelte";
    import MemberCountChart from "./MemberCountChart.svelte";
    import { Heading } from 'flowbite-svelte';

    export let data;
</script>


<div class="flex place-content-center mt-8">
    <MeasurementPoints bind:data />
</div>


<div class="flex place-content-center mt-8">
    <MemberCountChart bind:data />
</div>



