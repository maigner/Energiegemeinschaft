<script>
    import YearlySummary from "./YearlySummary.svelte";
    import WeeklySumsChart from "./WeeklySumsChart.svelte";
    import WeeklyRelativeChart from "./WeeklyRelativeChart.svelte";
    import DailySumsChart from "./DailySumsChart.svelte";

    let { data } = $props();
</script>

<svelte:head>
    <title>ISCHLSTROM - Energieübersicht</title>
</svelte:head>

<div class="px-4 mt-4 mb-8 max-w-5xl mx-auto flex flex-col gap-8">
    {#if data.yearlySums}
        <YearlySummary yearlySums={data.yearlySums} />
    {/if}

    {#if data.weeklySums}
        <WeeklySumsChart weeklySums={data.weeklySums} />
        <WeeklyRelativeChart weeklySums={data.weeklySums} />
    {/if}

    {#if data.dailySums}
        <DailySumsChart dailySums={data.dailySums} />
    {:else}
        <p class="text-center text-gray-500 dark:text-gray-400">
            Für die letzten 30 Tage liegen noch keine Energiedaten vor.
        </p>
    {/if}
</div>
