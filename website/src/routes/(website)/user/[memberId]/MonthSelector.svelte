<script>
    import {
        Button,
        Dropdown,
        DropdownHeader,
        DropdownItem,
    } from "flowbite-svelte";
    import { ChevronDownOutline } from "flowbite-svelte-icons";

    let { data, dataRangeSelection = $bindable() } = $props();


    let dropDownOpen = $state(false);
</script>

<Button
    >{dataRangeSelection.name}<ChevronDownOutline
        class="w-6 h-6 ms-2 text-white dark:text-white"
    /></Button
>

<Dropdown bind:isOpen={dropDownOpen}>
    <DropdownHeader>
        <span class="block text-sm text-gray-900 dark:text-white"
            >Datenauswahl</span
        >
        <span class="block truncate text-sm font-medium"
            >Wählen Sie einen Zeitraum</span
        >
    </DropdownHeader>

    {#each data.dateSelectionOptions as dateSelectionOption}
        <DropdownItem
            onclick={() => {
                dataRangeSelection = dateSelectionOption;
                dropDownOpen = false;
            }}>{dateSelectionOption.name}</DropdownItem
        >
    {/each}
</Dropdown>
