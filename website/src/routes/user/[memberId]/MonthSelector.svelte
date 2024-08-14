<script>
    import { Button, Dropdown, DropdownItem } from "flowbite-svelte";
    import { ChevronDownOutline } from "flowbite-svelte-icons";

    export let data;
</script>



<Button
    class="text-2xl font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 text-center inline-flex items-center dark:hover:text-white bg-transparent hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent focus:ring-transparent dark:focus:ring-transparent py-0"
    >Gesamt<ChevronDownOutline class="w-2.5 m-2.5 ms-1.5" /></Button
>
<Dropdown class="w-64" offset="-6">
    <DropdownItem class="text-xl">Letztes Quartal</DropdownItem>
    <DropdownItem class="text-xl">Today</DropdownItem>
    <DropdownItem class="text-xl">Last 7 days</DropdownItem>
    <DropdownItem class="text-xl">Last 30 days</DropdownItem>
    <DropdownItem class="text-xl">Last 90 days</DropdownItem>
</Dropdown>
