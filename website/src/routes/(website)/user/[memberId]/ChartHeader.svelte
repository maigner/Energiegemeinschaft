<script>
    import MonthSelector from "./MonthSelector.svelte";
    let {
        options,
        title,
        subTitle,
        hint = "",
        dataRangeSelection = $bindable(),
    } = $props();
</script>

<div class="flex justify-between gap-2">
    <div>
        <p
            class="leading-none text-xl font-bold text-gray-900 dark:text-white pb-2"
        >
            {title}
        </p>
        <p class="text-base font-normal text-gray-500 dark:text-gray-400">
            {subTitle}
        </p>
    </div>
    <div
        class="flex items-center px-2.5 py-0.5 text-base font-semibold text-center shrink-0"
    >
        <MonthSelector {options} bind:dataRangeSelection />
    </div>
</div>
{#if hint}
    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-2">
        {@html hint}
    </p>
{/if}
