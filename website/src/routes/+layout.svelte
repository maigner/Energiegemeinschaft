<script>
    import { page } from "$app/stores";
    import Fab, { Label, Icon } from "@smui/fab";

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
    <div class="sponsors">
        <img src="sponsors.jpg" width="80%" alt="sponsors" />
    </div>
</div>

<div class="center">
    <a href="/impressum">Impressum</a>
</div>

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
    .sponsors {
        margin: 20px;
    }

    
</style>
