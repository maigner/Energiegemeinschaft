<script>
    import { invoke } from "@tauri-apps/api/core";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { List, Li, Heading, A } from "flowbite-svelte";
    import { CheckCircleSolid, CloseCircleSolid } from "flowbite-svelte-icons";
    import { onMount } from "svelte";
    import { Spinner } from "flowbite-svelte";
    import SimpleMenu from "$lib/SimpleMenu.svelte";

    let masterdataFileList = $state([]);

    onMount(async () => {
        try {
            const paths = await invoke("list_masterdata_files");

            // Immediately populate the list
            masterdataFileList = paths.map((path) => ({
                path,
                isLoaded: false,
                data_complete: false,
                errorList: [],
                missingSubscriptions: [],
                missingActivations: [],
            }));

            // Load each file and update reactively

            for (let i = 0; i < masterdataFileList.length; i++) {
                const data_complete = await invoke(
                    "check_masterdata_complete",
                    {
                        path: masterdataFileList[i].path,
                    },
                );

                masterdataFileList[i].isLoaded = true;
                masterdataFileList[i].data_complete = data_complete;

                masterdataFileList[i].missingSubscriptions = await invoke(
                    "load_masterdata_missing_subscriptions",
                    {
                        path: masterdataFileList[i].path,
                    },
                );
                masterdataFileList[i].missingActivations = await invoke(
                    "load_masterdata_missing_activations",
                    {
                        path: masterdataFileList[i].path,
                    },
                );
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

<Heading tag="h3">Masterdata</Heading>

<Heading
    tag="h2"
    class="mb-2 text-lg font-semibold text-gray-900 dark:text-white"
    >Das sind die letzten (max. 10) Dateien aus deinem Download Ordner</Heading
>

{#if masterdataFileList?.length < 1}
    <Heading
        tag="h3"
        class="mb-2 text-lg font-semibold text-gray-900 dark:text-white"
        >Keine Dateien vorhanden. Exportiere aus EEG-Faktura nach Downloads</Heading
    >
{/if}

<List tag="ul" class="space-y-1 text-gray-500 dark:text-gray-400">
    {#each masterdataFileList as masterdataFile}
        <Li icon>
            {#if !masterdataFile.isLoaded}
                <Spinner
                    size="4"
                    class="me-2 h-5 w-5 text-green-500 dark:text-green-400"
                />
            {:else if !masterdataFile.data_complete}
                <CloseCircleSolid
                    class="me-2 h-5 w-5 text-gray-500 dark:text-gray-400"
                />

                <span class="mx-2"
                    >S {masterdataFile.missingSubscriptions.length}</span
                >
                <span class="mx-2"
                    >A {masterdataFile.missingActivations.length}</span
                >


                <A
                    href="/masterdata/detail/{masterdataFile.path}"
                    class="font-medium hover:underline"
                    >{masterdataFile.path.split("/").pop()}</A
                >
                <div>
                    
                </div>
            {:else}
                <CheckCircleSolid
                    class="me-2 h-5 w-5 text-green-500 dark:text-green-400"
                />
                {masterdataFile.path.split("/").pop()}
            {/if}
        </Li>
    {/each}
</List>

<hr class="mt-16" />
<JsonView json={masterdataFileList} />
