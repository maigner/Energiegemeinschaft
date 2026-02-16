<script>
  import { invoke } from "@tauri-apps/api/core";
  import { JsonView } from "@zerodevx/svelte-json-view";
  import { List, Li, Heading } from "flowbite-svelte";
  import { CheckCircleSolid, CloseCircleSolid } from "flowbite-svelte-icons";
  import { onMount } from "svelte";
  import { Spinner } from "flowbite-svelte";

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
        hasErrors: true,
        errorList: [],
      }));

      // Load each file and update reactively
      for (let i = 0; i < energyReportFileList.length; i++) {
        const loadResult = await invoke("load_energy_report_file", {
          path: energyReportFileList[i].path,
        });

        energyReportFileList[i].isLoaded = true;
        energyReportFileList[i].hasErrors = loadResult;
      }
    } catch (error) {
      console.error(error);
    }
  });
</script>

<Heading
  tag="h2"
  class="mb-2 text-lg font-semibold text-gray-900 dark:text-white"
  >Das sind die letzten (max. 10) Dateien aus deinem Download Ordner</Heading
>

<List tag="ul" class="space-y-1 text-gray-500 dark:text-gray-400">
  {#each energyReportFileList as energyReportFile}
    <Li icon>
      {#if !energyReportFile.isLoaded}
        <Spinner
          size="4"
          class="me-2 h-5 w-5 text-green-500 dark:text-green-400"
        />
      {:else if energyReportFile.hasErrors}
        <CheckCircleSolid
          class="me-2 h-5 w-5 text-green-500 dark:text-green-400"
        />
      {:else}
        <CloseCircleSolid
          class="me-2 h-5 w-5 text-gray-500 dark:text-gray-400"
        />
      {/if}

      {energyReportFile.path}
    </Li>
  {/each}
</List>

<JsonView json={energyReportFileList} />
