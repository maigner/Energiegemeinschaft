<script>
    import Project from "$lib/Project.svelte";
    import { Blockquote, Button, Card, Heading } from "flowbite-svelte";
    import VideoButton from "$lib/dialog/VideoButton.svelte";
    import Fab, { Label } from "@smui/fab";

    /**
     * @type {any}
     */
    let innerWidth;
</script>

<svelte:window bind:innerWidth />

<div class="text-center">
    <Heading tag="h2" class="text-primary-800 mt-8">Willkommen</Heading>
</div>

<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Werden Sie Teil eines demokratischen Strommarktes!
            <br />
            Gemeinsam wird es gelingen.
        </Blockquote>
        <figcaption class="flex justify-center items-center mt-6 space-x-3">
            <div
                class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Energie aus Bad Ischl</cite
                >
                <cite
                    class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                    >für Bad Ischl</cite
                >
            </div>
        </figcaption>
    </figure>
</div>

<div class="flex place-content-center">
    <Project img="/smart_meter.webp" showMore={false}>
        <span slot="title">1. Stromzähler aktivieren</span>
        <div slot="content">
            <p class="mb-2">
                Ihr Netzbetreiber (z.B. NetzOÖ) hat möglicherweise Ihr
                Smartmeter noch nicht freigeschaltet.
            </p>

            <VideoButton
                videoId={"YZ0QkXqswe4"}
                title={""}
                label={"mehr über Smartmeter erfahren"}
            />

            <p class="mb-2">
                Registrieren Sie sich dazu im eService-Portal der Netz
                Oberösterreich unter <a
                    href="https://eservice.netzooe.at/app/login"
                    target="_blank">https://eservice.netzooe.at/app/login</a
                >
            </p>
            <p class="mb-2">
                Finden Sie in der Übersicht des eService-Portals Ihren aktiven
                Zählpunkt. Sie können auch mehrere aktive Zählpunkte haben.
            </p>
            <p class="mb-2">
                Wenn Ihnen bei Ihrem Zählpunkt die Funktion "Smartmeter aktiven"
                angeboten wird, dann führen Sie diese aus.
            </p>

            <p class="mb-2">
                Hilfe bekommen Sie bei NetzOÖ unter der Service-Hotline 05 9070
            </p>
        </div>
    </Project>
</div>


<div class="flex place-content-center">
    <Project img="/pen_writing.webp" showMore={false}>
        <span slot="title">2. Mitglied werden</span>
        <div slot="content">
            <p class="mb-2">
                Füllen Sie einfach folgendes Bewerbungsformular aus. 
            </p>
            <p class="mb-2">
                Wir melden uns bei Ihnen!
            </p>
            <p class="mb-2">
                Bitte beachten Sie, dass Ihre Dateneingabe noch keine automatische Mitgliedschaft
                bedeutet. Es fallen auch keine Kosten für Sie an.
            </p>
            <p class="mb-2"> 
                Details zur Mitgliedschaft
                entnehmen Sie bitte unseren <a 
                target="_blank" 
                href="https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf"
                >Statuten</a>.
            </p>
        </div>
    </Project>
</div>

<div class="flex place-content-center mt-4">
    <Fab extended href="https://forms.gle/dQMJmEeZp3bML4jP6" color="primary">
        <Label>Zur Bewerbung</Label>
    </Fab>
</div>

<div class="flex place-content-center mt-4">
    oder
</div>


<div class="flex place-content-center mt-4">
    <Fab extended href="/faq" color="primary">
        <Label>Ich habe noch Fragen</Label>
    </Fab>
</div>







