<script>
    import { Heading, Label, Fileupload } from "flowbite-svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";

    // csv parser
    import Papa from "papaparse";

    export let data;

    let isLoading;
    let fileInput;
    let csvData = [];
</script>

<Heading tag="h4" class="text-center text-primary-700 mb-4">Import</Heading>

<div>
    <form
        on:change={async () => {
            isLoading = true;
            const csvFile = fileInput[0];
            console.log(csvFile);

            if (!csvFile.name.endsWith(".csv")) {
                alert("no valid George csv");
                return;
            }

            Papa.parse(csvFile, {
                complete: function (results) {
                    csvData = results.data;
                },
                header: true, // Optional: treat first row as header
            });

            const requiredFields = [
                "Buchungsdatum"
            ];

            return;

            //upload
            const formData = new FormData();
            //formData.append("file", fileUploadFiles);

            let file = null;

            console.log(formData);

            formData.append("file", csvFile[0]); // Append the file to FormData
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
            } finally {
                isLoading = false;
            }
        }}
    >
        <Label class="space-y-2 mb-2">
            <span>CSV Export aus George hinzufügen</span>
            <Fileupload bind:files={fileInput} />
        </Label>
    </form>
</div>

{#each csvData as csvBooking}
    <JsonView json={csvBooking} />
{/each}
