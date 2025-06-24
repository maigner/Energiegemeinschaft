<script>
    import { isValidMeasurementPointIdentifier } from "$lib/measurementPointFormat";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import {
        Input,
        Label,
        Helper,
        Button,
        Tooltip,
        Heading,
    } from "flowbite-svelte";
    import {
        CircleMinusOutline,
        CirclePlusOutline,
    } from "flowbite-svelte-icons";

    let { measurementPoints = $bindable(), supportedTypes } = $props();
</script>

<Heading class="mt-8" tag="h6">Ihre Zählpunkte</Heading>
<p>
    Hinweis: Eine Zählpunktnummer der NetzOÖ beginnt mit AT003000 und hat
    insgesamt 33 Stellen, z.B.:
    <strong>AT0030000000123456789012345678901</strong>
</p>

{#each supportedTypes as measurementPointType}
    <div class="mt-8">
        {measurementPointType === "CONSUMPTION"
            ? "Bezugszählpunkt(e)"
            : "Einspeisezählpunkt(e)"}

        {#each measurementPoints.filter((item) => item.type === measurementPointType) as measurementPoint, index}
            <div class="mt-4">
                <Label for={"measurementPoint-" + index} class="mb-2"
                    >Zählpunktnummer</Label
                >

                <div class="w-full flex justify-between gap-2">
                    <div class="w-11/12 flex ml-auto">
                        <Input
                            type="text"
                            id={"measurementPoint-" + index}
                            bind:value={measurementPoint.identifier}
                            required
                        />
                        <div class="ml-1 mt-auto text-xs text-gray-500">
                            {measurementPoint.identifier.length}/33
                        </div>
                    </div>
                    <div class="w-1/12 my-auto">
                        <Button
                            class="p-1 bg-red-700 hover:bg-red-800"
                            onclick={() => {
                                //alert(measurementPoint.identifier);
                                measurementPoints = measurementPoints.filter(
                                    (item) =>
                                        item.identifier !==
                                        measurementPoint.identifier,
                                );
                            }}
                        >
                            <CircleMinusOutline />
                        </Button>
                        <Tooltip class="text-xs">Zählpunkt entfernen</Tooltip>
                    </div>
                </div>
                <div>
                    {#if isValidMeasurementPointIdentifier(measurementPoint.identifier) === false}
                        <Helper class="mt-2" color="red">
                            <span class="font-medium"
                                >Bitte geben Sie eine gültige Zählpunktnummer
                                ein.</span
                            >
                        </Helper>
                    {/if}
                </div>
            </div>
        {/each}
        <div class="flex mt-1">
            <div>
                <Button
                    class="p-1"
                    onclick={() => {
                        measurementPoints.push({
                            identifier: "AT003000",
                            type: measurementPointType,
                        });
                        measurementPoints = measurementPoints;
                    }}
                >
                    <CirclePlusOutline />
                </Button>
                {measurementPointType === "CONSUMPTION"
                    ? "Bezugszählpunkt"
                    : "Einspeisezählpunkt"} hinzufügen
            </div>
        </div>
    </div>
{/each}
