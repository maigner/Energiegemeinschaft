<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Badge, Indicator, Button } from "flowbite-svelte";
    import { BookOpenOutline } from "flowbite-svelte-icons";

    export let data;
    export let bookingId;

    $: fileList = data.bookingsAttachments.filter(
        (file) => file.booking_id === bookingId,
    );
</script>

<div class="">
    {#each fileList as file, index (file.id)}
        <Badge color="dark" rounded class="px-2 py-1 m-1 relative">
            <span class="text-xs">{file.filename.split("/").slice(-1)[0]}</span>
            <Button
                pill={true}
                class="!p-1 ml-2 text-xs"
                on:click={async () => {
                    try {
                        const res = await fetch(
                            "/api/finance/bookings/removeLabelFromBooking",
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    bookingId,
                                    fileId: file.id,
                                }),
                            },
                        );

                        if (!res.ok) {
                            throw new Error("Network response was not ok");
                        }

                        const response = await res.json();

                        if (response.success) {
                            /*
                            data.bookingsLabels =
                                data.bookingsLabels.filter(
                                    (
                                         it,
                                    ) => {
                                        return !(
                                            it.booking_id ===
                                                label.booking_id &&
                                            it.label_id === label.label_id
                                        );
                                    },
                                );*/
                        }
                    } catch (err) {
                        alert(err);
                    }

                    // TODO: call API to actually delete
                }}
            >
                <BookOpenOutline />
            </Button>
        </Badge>
    {/each}
</div>

