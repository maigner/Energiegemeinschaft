<script>
    import Imprint from "$lib/Imprint.svelte";
    import Fab, { Label, Icon } from "@smui/fab";

</script>

<div class="center">
    <img src="header.png" height="200px" alt="header" />
</div>

<div class="center">
    <div class="margins">
        <a href="/start">
            <Fab extended>
                <Label>Start</Label>
            </Fab></a
        >
    </div>
    <div class="margins">
        <a href="/vorteile">
            <Fab extended>
                <Label>Vorteile</Label>
            </Fab></a
        >
    </div>
    <div class="margins">
        <a href="/mitmachen">
            <Fab extended>
                <Label>Mitmachen</Label>
            </Fab></a
        >
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
