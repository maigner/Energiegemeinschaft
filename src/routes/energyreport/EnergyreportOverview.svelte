<script>
    import { invoke } from "@tauri-apps/api/core";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { List, Li, Heading, A, Tooltip } from "flowbite-svelte";
    import { CheckCircleSolid, CloseCircleSolid } from "flowbite-svelte-icons";
    import { onMount } from "svelte";
    import { Spinner } from "flowbite-svelte";
    import SimpleMenu from "$lib/SimpleMenu.svelte";

    /**
     * @type {any[] | null | undefined}
     */
    let energyReportFileList = $state([]);

    onMount(async () => {
        try {
            const paths = await invoke("list_energy_report_files");

            // Immediately populate the list
            energyReportFileList = paths.map((path) => ({
                path,
                isLoaded: false,
                measurements_complete: false,
                has_invalid_values: false,
                dirty_meterpoints: {},

                errorList: [],
            }));

            // Load each file and update reactively
            for (let i = 0; i < energyReportFileList.length; i++) {
                const measurements_complete = await invoke(
                    "check_energy_report_complete",
                    {
                        path: energyReportFileList[i].path,
                    },
                );

                energyReportFileList[i].isLoaded = true;
                energyReportFileList[i].measurements_complete =
                    measurements_complete;

                try {
                    const dirtyMeterpoints = await invoke(
                        "load_energy_report_file_dirty_meterpoints",
                        { path: energyReportFileList[i].path },
                    );

                    //console.log({ dirtyMeterpoints });
                    energyReportFileList[i].dirty_meterpoints =
                        dirtyMeterpoints;
                } catch (error) {
                    console.error(error);
                }
                try {
                    const hasInvalidValues = await invoke(
                        "check_energy_report_invalid_values",
                        { path: energyReportFileList[i].path },
                    );

                    //console.log({ dirtyMeterpoints });
                    energyReportFileList[i].has_invalid_values =
                        hasInvalidValues;
                } catch (error) {
                    console.error(error);
                }
            }
        } catch (error) {
            console.error(error);
        }
    });
</script>

<Heading tag="h3">EEGFaktura Energy Report</Heading>

<Heading
    tag="h2"
    class="mb-2 text-lg font-semibold text-gray-900 dark:text-white"
    >Das sind die letzten (max. 10) Dateien aus deinem Download Ordner</Heading
>

{#if energyReportFileList?.length < 1}
    <Heading
        tag="h3"
        class="mb-2 text-lg font-semibold text-gray-900 dark:text-white"
        >Keine Dateien vorhanden. Exportiere aus EEG-Faktura nach Downloads</Heading
    >
{/if}

<List tag="ul" class="space-y-1 text-gray-500 dark:text-gray-400">
    {#each energyReportFileList as energyReportFile}
        <Li icon>
            {#if !energyReportFile.isLoaded}
                <Spinner
                    size="4"
                    class="me-2 h-5 w-5 text-green-500 dark:text-green-400"
                />
            {:else if !energyReportFile.measurements_complete || energyReportFile.has_invalid_values}
                <Tooltip>Fehlende Messdaten</Tooltip>
                <CloseCircleSolid
                    class="me-2 h-5 w-5 text-gray-500 dark:text-gray-400"
                />
                {#if energyReportFile.has_invalid_values}
                    <span>
                        L3/L2 vorhanden._
                    </span>
                {/if}
                <span>
                    {Object.keys(energyReportFile.dirty_meterpoints).length} Daten
                    fehlen!
                </span>
                <A
                    href="/energyreport/detail/{energyReportFile.path}"
                    class="font-medium hover:underline ml-2"
                    >{energyReportFile.path.split("/").pop()}</A
                >
            {:else}
                <CheckCircleSolid
                    class="me-2 h-5 w-5 text-green-500 dark:text-green-400"
                />
                {energyReportFile.path.split("/").pop()}
            {/if}
        </Li>
    {/each}
</List>

<!--
<hr class="mt-16" />
<JsonView json={energyReportFileList} />
-->
