<script>
    import { page } from "$app/stores";
    import Imprint from "$lib/Imprint.svelte";
    import Fab, { Label, Icon } from "@smui/fab";

    $page.route.id;
</script>

<div class="center">
    <img src="header.png" height="200px" alt="header" />
</div>

<div class="center">
    <div class="margins">
        <Fab
            extended
            href="/"
            color={$page.route.id == "/" ? "primary" : "secondary"}
        >
            <Label>Start</Label>
        </Fab>
    </div>
    <div class="margins">
        <Fab
            extended
            href="/vorteile"
            color={$page.route.id == "/vorteile" ? "primary" : "secondary"}
        >
            <Label>Vorteile</Label>
        </Fab>
    </div>
    <div class="margins">
        <Fab
            extended
            href="/mitmachen"
            color={$page.route.id == "/mitmachen" ? "primary" : "secondary"}
        >
            <Label>Mitmachen</Label>
        </Fab>
    </div>
</div>

<slot />

<div class="center">
    <img src="sponsors.jpg" width="80%" alt="sponsors" />
</div>

<Imprint />

<style>
    .center {
        display: flex;
        justify-content: center;
        align-items: center;
    }
    .margins {
        margin-left: 20px;
        margin-right: 20px;
    }
</style>
