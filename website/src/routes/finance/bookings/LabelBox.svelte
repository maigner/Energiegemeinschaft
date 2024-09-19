<script>
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Select } from "flowbite-svelte";

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
        });

    /**
     * @type {number}
     */
    let labelId;
</script>

{bookingId}

<div class="flex justify-between items-center p-4 bg-yellow-100">
    <div class="bg-blue-100 p-4">
        existing labels

        <JsonView json={existingLabels}></JsonView>
    </div>
    <div class="bg-green-100 p-4">
        add new label

        <Select
            class="mt-2"
            placeholder="Label..."
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
                        let a = {
                            booking_id: response.data.bookingId,
                            label_id: response.data.labelId,
                        };

                        data.bookingsLabels.push(a);
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
