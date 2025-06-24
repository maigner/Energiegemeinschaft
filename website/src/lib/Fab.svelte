<script>
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { Button } from "flowbite-svelte";

    export let href;
    export let label;
    export let target= "_self";
    
</script>


<Button pill onclick={() => {
    if (browser) {
        if (target === "_self") {
            goto(href);
        }
        if (target === "_blank") {
            window.open(href, "_blank");
        }

    }
}}>{label.toUpperCase()}</Button>