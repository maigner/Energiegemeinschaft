<script>
    import Fab from "$lib/Fab.svelte";
    import { Checkbox, Helper, Label } from "flowbite-svelte";


    let { checkTerms = $bindable() } = $props();

    let boxColor = $state("bg-yellow-300");

    $effect(() => {
        boxColor = checkTerms ? "bg-green-300" : "bg-yellow-300";
    });
</script>

<div class={boxColor + " rounded-md p-4 mt-4"}>
    <Label class="text-lg">Sie möchten der EEG ischlstrom beitreten?</Label>
    <Checkbox bind:checked={checkTerms}
        >Ja, ich stimme auch den Statuten zu und verpflichte mich korrekte
        Angaben zu machen.</Checkbox
    >
</div>

<div class="flex items-center justify-center mt-2">
    <Fab
        href="https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf"
        label="Statuten herunterladen"
        target="_blank"
    ></Fab>
</div>
