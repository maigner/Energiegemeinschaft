<script>
    import Project from "$lib/Project.svelte";
    import {
        Blockquote,
        Button,
        Card,
        Checkbox,
        Heading,
        Input,
    } from "flowbite-svelte";
    import VideoButton from "$lib/dialog/VideoButton.svelte";
    import { Textarea } from "flowbite-svelte";
    import Fab, { Label } from "@smui/fab";

    /** @type {import('./$types').ActionData} */
    export let form;
</script>


{#if form?.message == "OK"}
    <div class="text-center">
        <Heading tag="h2" class="text-primary-800 mt-8">Vielen Dank!</Heading>
        <Heading tag="h3" class="text-primary-800 mt-8">Wir melden uns</Heading>

    </div>
    <div class="flex place-content-center mt-10">
        <Fab extended href="/" color="primary">
            <Label class="text-white">Zum Anfang</Label>
        </Fab>
    </div>
    
{:else}
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

    <div class="flex place-content-center">
        <Project img="/pen_writing.webp" showMore={false}>
            <span slot="title">Wir freuen uns auf Ihre Nachricht</span>
            <div slot="content">
                <p class="mb-2">Nutzen Sie einfach dieses Kontaktformular.</p>

                <form method="POST" action="?/contact">
                    <div class="mb-6">
                        <Label for="email" class="mb-2"
                            >Ihre E-Mail Adresse</Label
                        >
                        <Input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="john.doe@company.com"
                            required
                        />
                    </div>

                    <div class="mb-6">
                        <Label for="message" class="mb-2">Ihre Nachricht</Label>
                        <Textarea
                            id="message"
                            placeholder="Ihre Nachricht"
                            rows="4"
                            name="message"
                            required
                        />
                    </div>

                    <Button type="submit">Abschicken</Button>
                </form>
            </div>
        </Project>
    </div>
{/if}
