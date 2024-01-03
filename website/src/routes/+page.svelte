<script>
    import Project from "$lib/Project.svelte";
    import Fab, { Label } from "@smui/fab";
    import { Heading } from "flowbite-svelte";
    import { Blockquote } from "flowbite-svelte";
    import Savings from "./Savings.svelte";
    import { JSONEditor } from "svelte-jsoneditor";
    import { dev } from "$app/environment";

    export let data;

    let content = { json: data };
</script>

<!--
    <JSONEditor bind:content />
-->

<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl">
            Willkommen bei der Energiegemeinschaft Bad Ischl!
            <br />
            Erneuerbare Energie ist von entscheidender Bedeutung, weil sie dazu beiträgt,
            den Klimawandel einzudämmen.
        </Blockquote>
        <figcaption class="flex justify-center items-center mt-6 space-x-3">
            <div
                class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Energie aus Bad Ischl</cite
                >
                <cite
                    class="pl-3 text-sm font-light text-gray-500 dark:text-gray-400"
                    >für Bad Ischl</cite
                >
            </div>
        </figcaption>
    </figure>
</div>

<Savings bind:data />

<div class="text-center mt-5">
    <Heading tag="h2">Was gibt es Neues?</Heading>
</div>

<div class="flex place-content-center">
    <Project img="/gruppenfoto.webp">
        <span slot="title">Vereinsgründung</span>
        <div slot="content">
            Die Gründung einer Energiegemeinschaft ist ein bedeutender Schritt
            in Richtung nachhaltiger Energieversorgung. Menschen bündeln ihre
            Ressourcen und Fachkenntnisse, um erneuerba...
        </div>
    </Project>
</div>

<div class="text-center pt-8">
    <Heading tag="h2">Vorteile einer Energiegemeinschaft</Heading>
</div>

<div class="flex place-content-center">
    <Project img="tmp/energiewende.png">
        <span slot="title">Energiewende</span>
        <div slot="content">
            Sie fördern erneuerbare Energien, indem sie den gemeinsamen Einsatz
            von Solaranlagen oder Windkraftanlagen erleichtern und den
            Überschussstrom verteilen.
        </div>
    </Project>
</div>
<div class="flex place-content-center">
    <Project img="tmp/unabhängig.jpeg">
        <span slot="title">Unabhängigkeit</span>
        <div slot="content">
            Energiegemeinschaften bieten Unabhängigkeit von großen
            Energieunternehmen und ermöglichen es den Mitgliedern, ihre
            Energieversorgung selbst zu kontrollieren.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="tmp/versorgung.jpeg">
        <span slot="title">Versorgungssicherheit</span>
        <div slot="content">
            Gemeinschaften können in Notfällen auf eine zuverlässige
            Energiequelle zugreifen und so die Energieversorgung in Krisenzeiten
            sicherstellen.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="tmp/vernetzt.jpeg">
        <span slot="title">Soziale Vernetzung</span>
        <div slot="content">
            Energiegemeinschaften fördern den sozialen Zusammenhalt und den
            Austausch von Wissen und Ressourcen zwischen Mitgliedern, was die
            lokale Gemeinschaft stärkt.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Fab extended href="/mitmachen" color="primary">
        <Label>Jetzt Mitmachen</Label>
    </Fab>
</div>
