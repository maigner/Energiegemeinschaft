<script>
    import { Heading } from "flowbite-svelte";
    import SimpleMenu from "$lib/SimpleMenu.svelte";
    import MissingSubscription from "./MissingSubscription.svelte";
    import MissingActivations from "./MissingActivations.svelte";

    let { data } = $props();

</script>

<SimpleMenu
    items={[
        {
            href: "/",
            display: "Zurück",
        },
    ]}
/>

<Heading tag="h4">{data.path?.split("/").pop()}</Heading>


<div>
<MissingSubscription path={data.path} />
</div>


<div>
<MissingActivations path={data.path} />
</div>