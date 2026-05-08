<script>
    import { Heading } from "flowbite-svelte";
    import SingleDay from "./SingleDay.svelte";

    let { forecast } = $props();

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
</script>

<Heading tag="h3" class="mt-6">Bewölkung heute</Heading>
<SingleDay date={today} {forecast} />

<Heading tag="h3" class="mt-6">Bewölkung morgen</Heading>
<SingleDay date={tomorrow} {forecast} />

