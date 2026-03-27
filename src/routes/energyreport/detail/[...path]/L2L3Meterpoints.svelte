<script>
    import { invoke } from "@tauri-apps/api/core";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Button, Heading, Spinner } from "flowbite-svelte";
    import { onMount } from "svelte";
    import MeterPointList from "./MeterPointList.svelte";


    const { path } = $props();

    let dirtyMeterpoints = $state({});

    onMount(async () => {
        try {
            dirtyMeterpoints = await invoke(
                "load_energy_report_file_l2_l3_meterpoints",
                { path: path },
            );

            console.log({ dirtyMeterpoints });
        } catch (error) {
            console.error(error);
        }
    });
</script>


Zählpunkte mit L2/L3 Daten

{#if Object.keys(dirtyMeterpoints).length === 0}
    <Spinner />
{/if}

<Button>{Object.keys(dirtyMeterpoints).length} Zählpunkte</Button>


<MeterPointList meterpoints={dirtyMeterpoints} />
