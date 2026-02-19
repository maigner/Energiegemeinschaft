<script>
    import { Heading } from "flowbite-svelte";
    import DirtyMeterpoints from "./DirtyMeterpoints.svelte";
    import SimpleMenu from "$lib/SimpleMenu.svelte";

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

<DirtyMeterpoints path={data.path} />
