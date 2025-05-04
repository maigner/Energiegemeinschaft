<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import MeasurementPoints from "./MeasurementPoints.svelte";
    import MemberCountChart from "./MemberCountChart.svelte";
    import { Blockquote } from 'flowbite-svelte';

    export let data;
</script>



<div class="max-w-xl m-auto justify-center mb-8">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Mitglieder
        </Blockquote>
        
    </figure>
</div>




<div class="flex place-content-center mt-8">
    <MemberCountChart bind:data />
</div>


<div class="flex place-content-center mt-8">
    <JsonView json={data.members} />
</div>



<!--
<div class="flex place-content-center mt-8">
    <MeasurementPoints bind:data />
</div>
-->