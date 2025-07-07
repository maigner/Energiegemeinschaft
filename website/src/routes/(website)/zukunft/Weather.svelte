<script>
    import SingleDay from "./SingleDay.svelte";

    let { forecast } = $props();

    const today = new Date("2024-12-18");
    
</script>

das wetter

<SingleDay date={today} forecast={forecast} />

