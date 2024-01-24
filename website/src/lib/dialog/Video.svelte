<script>
    // @ts-nocheck

    import {
        Button,
        Checkbox,
        Input,
        Label,
        Modal,
        Skeleton,
    } from "flowbite-svelte";

    import Youtube from "svelte-youtube-embed";

    export let open;
    export let id;
    export let title;
</script>

<Modal
    title={title}
    bind:open
    size="lg"
    autoclose={true}
    outsideclose={true}
    dismissable={true}
    backdropClass="fixed inset-0 z-40 bg-gray-900 bg-opacity-95 dark:bg-opacity-95"
>
    
    <Youtube {id} />

</Modal>
