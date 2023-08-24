<script>
    import Imprint from "$lib/Imprint.svelte";

    
</script>

<div class="center">
    <img src="header.png" width="80%" alt="header" />
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
</style>
