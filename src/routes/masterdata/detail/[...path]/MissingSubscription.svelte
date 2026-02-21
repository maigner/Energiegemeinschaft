<script>
    import { invoke } from "@tauri-apps/api/core";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Button, Heading, Spinner } from "flowbite-svelte";
    import { onMount } from "svelte";


    const { path } = $props();

    let dirtyMeterpoints = $state({});

    let isMounted = $state(false);

    onMount(async () => {
        try {
            dirtyMeterpoints = await invoke(
                "load_masterdata_missing_subscriptions",
                { path: path },
            );

            console.log({ dirtyMeterpoints });
        } catch (error) {
            console.error(error);
        }
        isMounted = true;
    });
</script>


Zählpunkte mit fehlenden Daten

{#if isMounted === false}
    <Spinner />
{/if}

<Button>{Object.keys(dirtyMeterpoints).length} Zählpunkte</Button>


<JsonView json={dirtyMeterpoints} />