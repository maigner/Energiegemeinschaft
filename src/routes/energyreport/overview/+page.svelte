<script>
  import { invoke } from "@tauri-apps/api/core";
  import { JsonView } from "@zerodevx/svelte-json-view";
  import { List, Li, Heading, A } from "flowbite-svelte";
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
        errorList: [],
      }));

      // Load each file and update reactively
      for (let i = 0; i < energyReportFileList.length; i++) {
        const measurements_complete = await invoke("check_energy_report_complete", {
          path: energyReportFileList[i].path,
        });

        energyReportFileList[i].isLoaded = true;
        energyReportFileList[i].measurements_complete = measurements_complete;
      }
    } catch (error) {
      console.error(error);
    }
  });
</script>

<SimpleMenu
    items={[
        {
            href: "/",
            display: "Start",
        },
    ]}
/>

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
      {:else if !energyReportFile.measurements_complete}

        <CloseCircleSolid
          class="me-2 h-5 w-5 text-gray-500 dark:text-gray-400"
        />
        <A href="/energyreport/detail/{energyReportFile.path}" class="font-medium hover:underline"
          >{energyReportFile.path}</A
        >
      {:else}
        <CheckCircleSolid
          class="me-2 h-5 w-5 text-green-500 dark:text-green-400"
        />
        {energyReportFile.path}
      {/if}
    </Li>
  {/each}
</List>

<!--
<hr class="mt-16" />
<JsonView json={energyReportFileList} />
-->