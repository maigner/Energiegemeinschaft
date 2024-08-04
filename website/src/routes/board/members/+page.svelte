<script>
    import Project from "$lib/Project.svelte";
    import MeasurementPoints from "./MeasurementPoints.svelte";
    import MemberCountChart from "./MemberCountChart.svelte";
    import { Blockquote, Heading } from 'flowbite-svelte';

    export let data;
</script>



<div class="max-w-xl m-auto justify-center mb-8">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Mitglieder
        </Blockquote>
        <figcaption class="flex justify-center items-center mt-6 space-x-3">
            <div
                class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Zählpunkte</cite
                >
                <cite
                    class="pl-3 font-medium text-gray-900 dark:text-white"
                >
                    Auswertungen
                </cite>
            </div>
        </figcaption>
    </figure>
</div>


<div class="flex place-content-center mt-8">
    <MeasurementPoints bind:data />
</div>


<div class="flex place-content-center mt-8">
    <MemberCountChart bind:data />
</div>



