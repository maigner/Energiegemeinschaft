<script>
    import Project from "$lib/Project.svelte";
    import MemberCountChart from "./MemberCountChart.svelte";
    import { Heading } from 'flowbite-svelte';

    export let data;
</script>

<Heading class="text-primary-700" tag="h6">Vereinsstärke</Heading>

<div class="flex place-content-center">
    <MemberCountChart bind:data />
</div>

