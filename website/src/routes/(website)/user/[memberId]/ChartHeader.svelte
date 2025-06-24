<script>
    import MonthSelector from "./MonthSelector.svelte";
    let { data, title, subTitle, dataRangeSelection = $bindable() } = $props();
</script>

<div class="flex justify-between">
    <div>
        <p
            class="leading-none text-xl font-bold text-gray-900 dark:text-white pb-2"
        >
            {title}
        <p>
        <p class="text-base font-normal text-gray-500 dark:text-gray-400">
            {subTitle}
        </p>
    </div>
    <div
        class="flex items-center px-2.5 py-0.5 text-base font-semibold text-green-500 dark:text-green-500 text-center"
    >
        <MonthSelector {data} bind:dataRangeSelection />
    </div>
</div>
