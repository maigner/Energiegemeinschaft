<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Heading } from "flowbite-svelte";
    import { onMount } from "svelte";
    import EnergyReportOverview from "./EnergyReportOverview.svelte";

    let energyReportFileList = $state();

    onMount(async () => {
        invoke("list_energy_report_files")
            .then((result) => (energyReportFileList = result))
            .catch((error) => console.error(error));
    });
/*
    listen("energyfile-ready", (event) => {
        console.log(`received event ${event.event}`);

        console.log({ event });

        //alert(event.payload);
    });
    */
</script>

<Heading tag="h3">EEGFaktura Energy Report</Heading>


<EnergyReportOverview />

<JsonView json={energyReportFileList} />
