<script>
    import { Badge, Button, Spinner, Tooltip } from "flowbite-svelte";
    import { Fileupload, Label } from "flowbite-svelte";
    import {
        BookOpenOutline,
        FileCirclePlusOutline,
        TrashBinOutline,
    } from "flowbite-svelte-icons";
    import download from "downloadjs";
    import { shortenString } from "$lib/format";

    /**
     * @typedef {{ attachment_id: number, booking_id: number, filename: string }} Attachment
     */

    let { bookingId, fileList = $bindable() } = $props();

    let fileUploadFiles = $state(/** @type {FileList | null} */ (null));

    let uploadVisible = $state(false);
    let isLoading = $state(false);

    /** @param {Attachment} file */
    const downloadAttachment = async (file) => {
        try {
            const res = await fetch(
                `/api/finance/bookings/getAttachment?attachmentId=${file.attachment_id}`,
            );

            if (!res.ok) {
                throw new Error(`Download fehlgeschlagen (${res.status})`);
            }

            const blob = await res.blob();
            download(blob, file.filename.split("/").slice(-1)[0]);
        } catch (err) {
            alert(err);
        }
    };

    /** @param {Attachment} file */
    const deleteAttachment = async (file) => {
        const filename = file.filename.split("/").slice(-1)[0];
        if (!confirm(`Datei "${filename}" löschen?`)) {
            return;
        }

        try {
            const res = await fetch("/api/finance/bookings/deleteAttachment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ attachmentId: file.attachment_id }),
            });

            if (!res.ok) {
                throw new Error(`Löschen fehlgeschlagen (${res.status})`);
            }

            fileList = fileList.filter(
                (/** @type {Attachment} */ it) =>
                    it.attachment_id !== file.attachment_id,
            );
        } catch (err) {
            alert(err);
        }
    };

    const uploadFiles = async () => {
        if (!fileUploadFiles || fileUploadFiles.length === 0) return;

        isLoading = true;
        try {
            for (const file of fileUploadFiles) {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("bookingId", bookingId);

                const response = await fetch(
                    "/api/finance/bookings/uploadAttachment",
                    {
                        method: "POST",
                        body: formData,
                    },
                );

                if (!response.ok) {
                    throw new Error(
                        `Upload von "${file.name}" fehlgeschlagen (${response.status})`,
                    );
                }

                const result = await response.json();
                if (result.success) {
                    fileList.push({
                        booking_id: result.attachment.booking_id,
                        filename: result.attachment.filename,
                        attachment_id: result.attachment.id,
                    });
                    fileList = fileList;
                }
            }
            uploadVisible = false;
        } catch (error) {
            console.error("Error uploading file:", error);
            alert(error);
        } finally {
            fileUploadFiles = null;
            isLoading = false;
        }
    };
</script>

{#if isLoading}
    <Spinner />
{/if}
<div class="">
    {#each fileList.filter((/** @type {Attachment} */ file) => file.booking_id === bookingId) as file, index (file.attachment_id)}
        {@const filename = file.filename.split("/").slice(-1)[0]}
        <Badge color="indigo" rounded class="px-2 py-1 m-1 relative">
            <span class="text-xs">{shortenString(filename, 20)}</span>
            <Button
                onclick={() => downloadAttachment(file)}
                pill={true}
                class="!p-1 ml-2 text-xs"
            >
                <BookOpenOutline />
            </Button>
            <Button
                onclick={() => deleteAttachment(file)}
                pill={true}
                color="red"
                class="!p-1 ml-1 text-xs"
            >
                <TrashBinOutline />
            </Button>
        </Badge>
        <Tooltip>{filename}</Tooltip>
    {/each}
</div>

{#if uploadVisible}
    <div>
        <form onchange={uploadFiles}>
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
        onclick={() => {
            uploadVisible = !uploadVisible;
        }}
    >
        <FileCirclePlusOutline />
    </Button>
    <!--<Tooltip>Beleg, etc. hochladen</Tooltip>-->
</div>
