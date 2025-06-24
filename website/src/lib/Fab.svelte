<script>
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { Button } from "flowbite-svelte";

    let { href, label, target = "_self" } = $props();
</script>

<Button
    pill
    onclick={() => {
        if (browser) {
            if (target === "_self") {
                goto(href);
            }
            if (target === "_blank") {
                window.open(href, "_blank");
            }
        }
    }}>{label.toUpperCase()}</Button
>
