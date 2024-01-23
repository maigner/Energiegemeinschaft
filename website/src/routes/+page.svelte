<script>
    import Project from "$lib/Project.svelte";
    import Fab, { Label } from "@smui/fab";
    import { Card, Heading } from "flowbite-svelte";
    import { Blockquote } from "flowbite-svelte";
    import Savings from "./Savings.svelte";
    //import { JSONEditor } from "svelte-jsoneditor";
    import { dev } from "$app/environment";

    export let data;

    let content = { json: data };
</script>

<!--
    <JSONEditor bind:content />
-->

<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
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
                    class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                    >für Bad Ischl</cite
                >
            </div>
        </figcaption>
    </figure>
</div>


<Savings bind:data />



<div class="text-center">
    <Heading tag="h3" class="text-primary-800 mt-6">Vorteile einer Energiegemeinschaft</Heading>
</div>
<div class="flex place-content-center">
    <Project img="/wasserrad.webp">
        <span slot="title">100% Erneuerbare Energie</span>
        <div slot="content">
            ISCHL STROM fördert erneuerbare Energien, indem sie den gemeinsamen Einsatz
            von Solaranlagen erleichtern und den
            Überschussstrom in Bad Ischl verteilen.
        </div>
    </Project>
</div>
<div class="flex place-content-center">
    <Project img="/freiheit.webp">
        <span slot="title">Unabhängigkeit</span>
        <div slot="content">
            Energiegemeinschaften fördern die Unabhängigkeit von Konzernen, Öl und Gas 
            und ermöglichen es den Mitgliedern, ihre
            Energieversorgung selbst mitzubestimmen.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="/miteinander.webp">
        <span slot="title">Miteinander</span>
        <div slot="content">
            Wir vernetzten nicht nur unseren Strom sondern auch unsere Fähigkeiten.
            Energiegemeinschaften fördern den sozialen Zusammenhalt und den
            Austausch von Wissen und Ressourcen zwischen Mitgliedern, was die
            lokale Gemeinschaft stärkt.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="/sichere_netzte.webp">
        <span slot="title">Versorgungssicherheit</span>
        <div slot="content">
            Gemeinschaften können in Notfällen auf eine zuverlässige
            Energiequelle zugreifen und so die Energieversorgung in Krisenzeiten
            sicherstellen.
        </div>
    </Project>
</div>




<div class="text-center">
    <Heading tag="h3" class="text-primary-800 mt-6">Wer ist ISCHL strom?</Heading>
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




<div class="flex place-content-center">
    <Fab extended href="/mitmachen" color="primary">
        <Label>Jetzt Mitmachen</Label>
    </Fab>
</div>
