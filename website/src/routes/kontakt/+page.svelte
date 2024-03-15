<script>
    import Project from "$lib/Project.svelte";
    import { Blockquote, Button, Card, Heading } from "flowbite-svelte";
    import VideoButton from "$lib/dialog/VideoButton.svelte";

    /**
     * @type {any}
     */
    let innerWidth;
</script>

<svelte:window bind:innerWidth />

<div class="text-center">
    <Heading tag="h2" class="text-primary-800 mt-8">Kontakt</Heading>
</div>

<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Sie erreichen uns per E-Mail unter
            <br />
            folgender Adresse
        </Blockquote>
    </figure>
</div>

<div class="text-center">
    <Heading tag="h3" class="text-primary-800 mt-8">
        <a href="mailto:info@ischlstrom.org">info@ischlstrom.org</a>
    </Heading>
</div>
