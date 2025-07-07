<script>
    import { formatDate } from "$lib/format";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Heading } from "flowbite-svelte";
    import SingleDay from "./SingleDay.svelte";

    let { forecast } = $props();

    const today = new Date();
    
</script>

das wetter

<SingleDay date={today} forecast={forecast} />

