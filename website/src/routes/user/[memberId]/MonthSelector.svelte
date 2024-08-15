<script>
    import { Button, Dropdown, DropdownItem } from "flowbite-svelte";
    import { ChevronDownOutline } from "flowbite-svelte-icons";

    export let data;

    //data.dataRangeSelection = "Gesamt";

    let dropDownOpen = false;

</script>


<Button
    >{data.dataRangeSelection}<ChevronDownOutline
        class="w-6 h-6 ms-2 text-white dark:text-white"
    /></Button
>

<Dropdown bind:open={dropDownOpen}>
    <div slot="header" class="px-4 py-2">
        <span class="block text-sm text-gray-900 dark:text-white"
            >Datenauswahl</span
        >
        <span class="block truncate text-sm font-medium">Wählen Sie einen Zeitraum</span
        >
    </div>

    <DropdownItem on:click={()=> {
        data.dataRangeSelection = "Quartal";
        dropDownOpen = false;
    }}>Quartal</DropdownItem>
    <DropdownItem on:click={()=> {
        data.dataRangeSelection = "Halbjahr";
        dropDownOpen = false;
    }}>Halbjahr</DropdownItem>
    <DropdownItem on:click={()=> {
        data.dataRangeSelection = "Jahr";
        dropDownOpen = false;
    }}>Jahr</DropdownItem>
    <DropdownItem on:click={()=> {
        data.dataRangeSelection = "Gesamt";
        dropDownOpen = false;
    }}>Gesamt</DropdownItem>


</Dropdown>
