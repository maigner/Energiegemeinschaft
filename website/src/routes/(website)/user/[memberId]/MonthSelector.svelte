<script>
    import { Button, Dropdown, DropdownItem } from "flowbite-svelte";
    import { ChevronDownOutline } from "flowbite-svelte-icons";

    export let data;

    //data.dataRangeSelection = "Gesamt";

    let dropDownOpen = false;
</script>

<Button
    >{data.dataRangeSelection.name}<ChevronDownOutline
        class="w-6 h-6 ms-2 text-white dark:text-white"
    /></Button
>

<Dropdown bind:open={dropDownOpen}>
    <div slot="header" class="px-4 py-2">
        <span class="block text-sm text-gray-900 dark:text-white"
            >Datenauswahl</span
        >
        <span class="block truncate text-sm font-medium"
            >Wählen Sie einen Zeitraum</span
        >
    </div>


    {#each data.dateSelectionOptions as dateSelectionOption}
        <DropdownItem
            on:click={() => {
                data.dataRangeSelection = dateSelectionOption;
                dropDownOpen = false;
            }}>{dateSelectionOption.name}</DropdownItem
        >
    {/each}
</Dropdown>
