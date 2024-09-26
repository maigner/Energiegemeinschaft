<script>
    import { browser } from "$app/environment";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Badge, Indicator, Button } from "flowbite-svelte";
    import { BookOpenOutline } from "flowbite-svelte-icons";
    import download from "downloadjs";

    export let data;
    export let bookingId;

    $: fileList = data.bookingsAttachments.filter(
        (file) => file.booking_id === bookingId,
    );

    async function downloadTempFile(attachmentId) {
        // This submits a POST request to trigger the download action
        const res = await fetch("/download", {
            method: "POST",
            body: new FormData(),
        });

        // Create a blob from the response
        const blob = await res.blob();

        // Create a link to download the file
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "tempfile.pdf"; // Set the download file name
        link.click();
    }
</script>

<div class="">
    {#each fileList as file, index (file.id)}
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
