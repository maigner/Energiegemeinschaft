<script>
    import { formatDate } from "$lib/format";
    import { Button } from "flowbite-svelte";
    import {
        ChevronLeftOutline,
        ChevronRightOutline,
    } from "flowbite-svelte-icons";

    let {
        options = [],
        dataRangeSelection = $bindable(),
        currentStartDate,
        currentEndDate,
    } = $props();

    let currentIndex = $derived(
        options.findIndex(
            (/** @type {{ name: string; }} */ option) =>
                option.name === dataRangeSelection?.name,
        ),
    );

    const goTo = (/** @type {number} */ index) => {
        if (index >= 0 && index < options.length) {
            dataRangeSelection = options[index];
        }
    };
</script>

<div class="flex items-center justify-center gap-2">
    <Button
        color="light"
        class="p-2"
        disabled={currentIndex <= 0}
        aria-label="Vorheriger Zeitraum"
        onclick={() => goTo(currentIndex - 1)}
    >
        <ChevronLeftOutline class="w-5 h-5" />
    </Button>

    <div class="text-center">
        <div class="text-xl font-semibold text-gray-900 dark:text-white">
            {dataRangeSelection?.name ?? ""}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(currentStartDate)}
            bis
            {formatDate(currentEndDate)}
        </div>
    </div>

    <Button
        color="light"
        class="p-2"
        disabled={currentIndex < 0 || currentIndex >= options.length - 1}
        aria-label="Nächster Zeitraum"
        onclick={() => goTo(currentIndex + 1)}
    >
        <ChevronRightOutline class="w-5 h-5" />
    </Button>
</div>
