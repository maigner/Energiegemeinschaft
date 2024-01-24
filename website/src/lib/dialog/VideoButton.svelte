<script>
// @ts-nocheck

    import { Button, Checkbox, Input, Label, Modal, Skeleton } from "flowbite-svelte";    

    import Video from "./Video.svelte";

    let open;

    export let videoId;
    export let title;
    export let label;


</script>


<Video bind:open={open} title={title} id={videoId} />

<p class="mb-2">
    <Button on:click={ () => { open = true; }}>{label}</Button>
</p>