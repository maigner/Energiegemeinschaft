<script>
    import { Checkbox, Helper, Label } from "flowbite-svelte";

    let { checkNewsletter = $bindable() } = $props();

    let boxColor = $state("bg-yellow-300");

    $effect(() => {
        boxColor = checkNewsletter ? "bg-green-300" : "bg-yellow-300";
    });
</script>

<div class={boxColor + " rounded-md p-4 mt-4"}>
    <Label class=""
        >Möchten Sie den Newsletter von ISCHLSTROM abonnieren? (Optional)
    </Label>
    <Checkbox bind:checked={checkNewsletter}
        >Ja, ich möchte den Newsletter auch erhalten.</Checkbox
    >
</div>
