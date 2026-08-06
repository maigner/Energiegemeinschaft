<script>
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { Button } from "flowbite-svelte";

    let { href, label, target = "_self", prominent = false } = $props();
</script>

<Button
    pill
    size={prominent ? "xl" : "md"}
    class={prominent
        ? "font-bold shadow-lg shadow-primary-500/50 hover:scale-105 transition-transform"
        : ""}
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
