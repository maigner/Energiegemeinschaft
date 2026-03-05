<script>
    import SimpleMenu from "$lib/SimpleMenu.svelte";
    import EnergyreportOverview from "../EnergyreportOverview.svelte";


</script>

<SimpleMenu
    items={[
        {
            href: "/",
            display: "Start",
        },
    ]}
/>

<EnergyreportOverview />