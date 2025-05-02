<script>

    import MonthSelector from "./MonthSelector.svelte";
    export let data;


</script>

<div class="flex justify-between">
    <div>
        <h5
            class="leading-none text-3xl font-bold text-gray-900 dark:text-white pb-2"
        >
            <slot name="title"></slot>
        </h5>
        <p class="text-base font-normal text-gray-500 dark:text-gray-400">
            <slot name="subTitle"></slot>
        </p>
    </div>
    <div
        class="flex items-center px-2.5 py-0.5 text-base font-semibold text-green-500 dark:text-green-500 text-center"
    >
        <MonthSelector bind:data />
    </div>
</div>