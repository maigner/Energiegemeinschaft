<script lang="ts">
    import { Toolbar, ToolbarButton, ToolbarGroup } from "flowbite-svelte";
    import {
        HomeOutline,
        EnvelopeOutline,
        ImageOutline,
    } from "flowbite-svelte-icons";
    import { DarkMode } from "flowbite-svelte";

    function toggleDark() {
        document.documentElement.classList.toggle("dark");
    }
</script>

<Toolbar color="primary">
    <ToolbarGroup>
        <ToolbarButton><HomeOutline class="h-6 w-6" /></ToolbarButton>
        <ToolbarButton><EnvelopeOutline class="h-6 w-6" /></ToolbarButton>
        <ToolbarButton><ImageOutline class="h-6 w-6" /></ToolbarButton>
    </ToolbarGroup>
    <ToolbarGroup>
        <ToolbarButton><HomeOutline class="h-6 w-6" /></ToolbarButton>
        <ToolbarButton><EnvelopeOutline class="h-6 w-6" /></ToolbarButton>
        <ToolbarButton><ImageOutline class="h-6 w-6" /></ToolbarButton>
    </ToolbarGroup>
    {#snippet end()}
        <ToolbarButton><DarkMode /></ToolbarButton>
    {/snippet}
</Toolbar>
