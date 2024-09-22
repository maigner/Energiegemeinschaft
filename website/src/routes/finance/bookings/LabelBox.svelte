<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Badge, Select, Indicator, Button } from "flowbite-svelte";
    import { ThumbsUpSolid, TrashBinOutline } from "flowbite-svelte-icons";

    export let data;
    export let bookingId;

    $: existingLabels = data.bookingsLabels.filter((it) => {
        return it.booking_id === bookingId;
    });

    $: labelsToAdd = data.labels
        .filter((it) => {
            // not in existingLabels ?
            let exists = existingLabels.filter((l) => {
                return l.label_id === it.id;
            });
            return exists.length === 0;
        })
        .map((it) => {
            return {
                value: it.id,
                name: it.label,
            };
        }).sort((a, b) => a.name >= b.name);

    /**
     * @type {number}
     */
    let labelId;
</script>


<div class="">
    <div class="">
        {#each existingLabels as label, index (label.label_id)}
            <Badge color={label.color} rounded class="px-2 py-1 m-1 relative">
                <Indicator
                    color={label.color}
                    size="md"
                    class="me-1"
                /><span class="text-xs">{label.label}</span>
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
                                        labelId: label.label_id,
                                    }),
                                },
                            );

                            if (!res.ok) {
                                throw new Error("Network response was not ok");
                            }

                            const response = await res.json();

                            if (response.success) {
                                data.bookingsLabels =
                                    data.bookingsLabels.filter((/** @type {{ booking_id: any; label_id: any; }} */ it) => {
                                        return !(
                                            it.booking_id ===
                                                label.booking_id &&
                                            it.label_id === label.label_id
                                        );
                                    });
                            }
                        } catch (err) {
                            alert(err);
                        }

                        // TODO: call API to actually delete
                    }}
                >
                    
                    <TrashBinOutline />
                </Button>
            </Badge>
        {/each}
    </div>


    <div class="w-40 max-w-60">

        <Select
            
            class="mt-2 text-xs"
            placeholder="Kategorie..."
            items={labelsToAdd}
            bind:value={labelId}
            on:change={async (e) => {
                try {
                    const res = await fetch(
                        "/api/finance/bookings/addLabelToBooking",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                bookingId,
                                labelId,
                            }),
                        },
                    );

                    if (!res.ok) {
                        throw new Error("Network response was not ok");
                    }

                    const response = await res.json();

                    if (response.success) {
                        data.bookingsLabels.push(response.data);
                        data.bookingsLabels = data.bookingsLabels;
                        labelId = "";
                    }
                } catch (err) {
                    alert(err);
                }
            }}
        />
    </div>
</div>
