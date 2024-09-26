<script>
    import { browser } from "$app/environment";
    import { JsonView } from "@zerodevx/svelte-json-view";

    import { Button, Dropzone, Heading, Spinner } from "flowbite-svelte";
    import { onMount } from "svelte";
    import { List, Li } from "flowbite-svelte";
    import {
        Table,
        TableBody,
        TableBodyCell,
        TableBodyRow,
        TableHead,
        TableHeadCell,
    } from "flowbite-svelte";
    import { TrashBinOutline } from "flowbite-svelte-icons";

    const upload = async (file) => {
        console.log("upload");
        console.log(file);
    };

    /**
     * @type {HTMLElement | null}
     */
    let fileInput;
    /**
     * @type {HTMLElement | null}
     */
    let uploadForm;

    /**
     * @type {((e: DragEvent) => void) | null | undefined}
     */
    let dropHandle;

    /**
     * @type {((e: Event) => void) | null | undefined}
     */
    let handleChange;

    export let data;

    onMount(() => {
        if (browser) {
            fileInput = document.getElementById("fileInput");
            uploadForm = document.getElementById("uploadForm");

            handleChange = (event) => {
                const files = event.target.files;
                if (files.length > 0) {
                    //if (browser) alert(files[0].name);
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(files[0]);
                    fileInput.files = dataTransfer.files;
                    uploadForm.submit();
                }
            };

            dropHandle = (event) => {
                const dataTransfer = new DataTransfer();

                event.preventDefault();
                if (event.dataTransfer.items) {
                    [...event.dataTransfer.items].forEach((item, i) => {
                        if (item.kind === "file") {
                            const file = item.getAsFile();
                            // save file
                            //if (browser) alert(file.name);
                            dataTransfer.items.add(file);
                        }
                    });
                } else {
                    [...event.dataTransfer.files].forEach((file, i) => {
                        //if (browser) alert(file.name);
                        dataTransfer.items.add(file);
                    });
                }

                fileInput.files = dataTransfer.files;
                uploadForm.submit();
            };
        }
    });
</script>

<form
    id="uploadForm"
    method="POST"
    action="?/upload"
    enctype="multipart/form-data"
>
    <!-- content -->
    <input
        type="file"
        id="fileInput"
        name="files"
        multiple
        style="display: none;"
    />
    <input type="hidden" name="bookingId" value={data.bookingId} />
</form>

<Heading
    tag="h6"
    customSize="text-lg font-semibold"
    class="mb-2 text-lg font-semibold">Bestehende Dateien</Heading
>

<Table>
    <TableHead>
        <TableHeadCell>Dateiname</TableHeadCell>
        <TableHeadCell></TableHeadCell>
    </TableHead>
    <TableBody tableBodyClass="divide-y">
        {#each data.directoryContents.sort((a, b) => a.lastmod < b.lastmod) as file}
            <TableBodyRow>
                <TableBodyCell>{file.basename}</TableBodyCell>
                <TableBodyCell>
                    <form
                        id="deleteForm-{file.etag}"
                        method="POST"
                        action="?/delete"
                    >
                        <!-- content -->
                        <input
                            type="hidden"
                            name="bookingId"
                            value={data.bookingId}
                        />
                        <input
                            type="hidden"
                            name="filename"
                            value={file.filename}
                        />
                        <Button type="submit">
                            <TrashBinOutline />
                        </Button>
                    </form>
                </TableBodyCell>
            </TableBodyRow>
        {/each}
    </TableBody>
</Table>

<Heading
    tag="h6"
    customSize="text-lg font-semibold"
    class="mb-2 text-lg font-semibold">Dateien Hochladen</Heading
>
<Dropzone
    id="dropzone"
    on:drop={dropHandle}
    on:dragover={(event) => {
        event.preventDefault();
    }}
    on:change={handleChange}
>
    <svg
        aria-hidden="true"
        class="mb-3 w-10 h-10 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        /></svg
    >
    <p class="mb-2 text-sm text-gray-500 dark:text-gray-400">
        <span class="font-semibold">Hier klicken</span> oder drag and drop
    </p>
    <p class="text-xs text-gray-500 dark:text-gray-400">
        PDF, DOCX, ... (max. 4 GB)
    </p>
</Dropzone>
