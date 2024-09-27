<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Badge, Button } from "flowbite-svelte";
    import { Fileupload, Label } from "flowbite-svelte";
    import {
        BookOpenOutline,
        FileCirclePlusOutline,
        TrashBinOutline,
    } from "flowbite-svelte-icons";
    import download from "downloadjs";

    export let data;
    export let bookingId;

    let fileUploadFiles;

    $: fileList = data.bookingsAttachments.filter(
        (file) => file.booking_id === bookingId,
    );

    let uploadVisible = false;
</script>

<div class="">
    {#each fileList as file, index (file.attachment_id)}
        <Badge color="dark" rounded class="px-2 py-1 m-1 relative">
            <span class="text-xs">{file.filename.split("/").slice(-1)[0]}</span>
            <Button
                on:click={async () => {
                    try {
                        const res = await fetch(
                            `/api/finance/bookings/getAttachment?attachmentId=${file.attachment_id}`,
                            {
                                method: "GET",
                            },
                        );

                        if (!res.ok) {
                            throw new Error("Network response was not ok");
                        }

                        const blob = await res.blob();

                        // Use the download library to download the file
                        download(blob, file.filename.split("/").slice(-1)[0]);
                    } catch (err) {
                        alert(err);
                    }
                }}
                pill={true}
                class="!p-1 ml-2 text-xs"
            >
                <BookOpenOutline />
            </Button>
        </Badge>
    {/each}
</div>

{#if uploadVisible}
    <div>
        <form
            on:change={async () => {
                console.log(fileUploadFiles);
                //upload
                const formData = new FormData();
                //formData.append("file", fileUploadFiles);

                let file = null;

                console.log(formData);

                formData.append("file", fileUploadFiles[0]); // Append the file to FormData
                formData.append("bookingId", bookingId);

                try {
                    const response = await fetch(
                        "/api/finance/bookings/uploadAttachment",
                        {
                            method: "POST",
                            body: formData,
                        },
                    );

                    const result = await response.json();
                    console.log("Upload Result:", result);
                    if (result.success) {
                        // append attachment data to data.bookingsAttachments
                        //console.log(result.attachment);

                        data.bookingsAttachments.push({
                            booking_id: result.attachment.booking_id,
                            filename: result.attachment.filename,
                            attachment_id: result.attachment.id,
                        });
                        data.bookingsAttachments = data.bookingsAttachments;
                    }
                } catch (error) {
                    console.error("Error uploading file:", error);
                }
            }}
        >
            <Label class="space-y-2 mb-2">
                <span>Datei hinzufügen</span>
                <Fileupload multiple bind:files={fileUploadFiles} />
            </Label>
        </form>
    </div>
{/if}
<div class="w-fit ml-auto">
    <Button
        color="alternative"
        on:click={() => {
            uploadVisible = !uploadVisible;
        }}
    >
        <FileCirclePlusOutline />
    </Button>
    <!--<Tooltip>Beleg, etc. hochladen</Tooltip>-->
</div>
