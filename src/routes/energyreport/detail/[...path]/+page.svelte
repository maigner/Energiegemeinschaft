<script>
    import { Heading } from "flowbite-svelte";
    import DirtyMeterpoints from "./DirtyMeterpoints.svelte";
    import SimpleMenu from "$lib/SimpleMenu.svelte";
    import L2L3Meterpoints from "./L2L3Meterpoints.svelte";

    const { data } = $props();
</script>

<SimpleMenu
    items={[
        {
            href: "/energyreport/overview",
            display: "Zurück",
        },
    ]}
/>

<Heading tag="h4">{data.path?.split("/").pop()}</Heading>

<L2L3Meterpoints path={data.path} />

<hr />

<DirtyMeterpoints path={data.path} />
