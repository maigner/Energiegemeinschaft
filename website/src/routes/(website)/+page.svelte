<script>
    import Project from "$lib/Project.svelte";
    import {  Heading } from "flowbite-svelte";
    import { Blockquote } from "flowbite-svelte";
    import Fab from "$lib/Fab.svelte";
    import { QuoteSolid } from "flowbite-svelte-icons";
    import Stammtisch from "./Stammtisch.svelte";


    let { data } = $props();

</script>


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


<!--
<Stammtisch />
-->

<div class="max-w-xl m-auto justify-center my-16">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Neue Tarife ab 1.1.2026!
            <br />
            Die Generalversammlung der Energiegemeinschaft ISCHLSTROM hat ab 1.1.2026 
            neue Tarife für die Verteilung des gemeinschaftlich erzeugten Stroms beschlossen.
        </Blockquote>
        <figcaption class=" justify-center items-center mt-6 space-x-3">
            <div
                class=" items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Einspeisung</cite
                >
                <cite
                    class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                    >9,5 cent/kWh</cite
                >
            </div>
            <div
                class=" items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Bezug</cite
                >
                <cite
                    class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                    >10 cent/kWh</cite
                >
            </div>
            <div>
                Der Mitgliedsbeitrag entfällt ab 2026!
            </div>
        </figcaption>
        
    </figure>
</div>


<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-6"
        >Vorteile einer Energiegemeinschaft</Heading
    >
</div>
<div class="flex place-content-center">
    <Project img="/wasserrad.webp" showMore={false} title="100% Erneuerbare Energie" subttile="">
        <div>
            ISCHL STROM fördert erneuerbare Energien, indem sie den gemeinsamen
            Einsatz von Solaranlagen erleichtern und den Überschussstrom in Bad
            Ischl verteilen.
        </div>
    </Project>
</div>
<div class="flex place-content-center">
    <Project img="/freiheit.webp" showMore={false} title="Unabhängigkeit">
        <div>
            Energiegemeinschaften fördern die Unabhängigkeit von Konzernen, Öl
            und Gas und ermöglichen es den Mitgliedern, ihre Energieversorgung
            selbst mitzubestimmen.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="/miteinander.webp" showMore={false} title="Miteinander">
        <div>
            Wir vernetzten nicht nur unseren Strom sondern auch unsere
            Fähigkeiten. Energiegemeinschaften fördern den sozialen Zusammenhalt
            und den Austausch von Wissen und Ressourcen zwischen Mitgliedern,
            was die lokale Gemeinschaft stärkt.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="/sichere_netzte.webp" showMore={false} title="Energiegemeinschaften im Detail">
        <div>
            Möchten Sie noch mehr zum Thema Energiegemeinschaften erfahren?

            <div class="flex place-content-center mt-4">
                <Fab label="EEGs auf Youtube" href="https://www.youtube.com/watch?v=DmedjR7SgbM" target="_blank" />
                
            </div>
        </div>
    </Project>
</div>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-6"
        >Wer ist ISCHL strom?</Heading
    >
</div>
<div class="flex place-content-center">
    <Project img="/gruppenfoto.webp" showMore={false} title="Vereinsgründung">
        <div>
            Die Gründung einer Energiegemeinschaft ist ein bedeutender Schritt
            in Richtung nachhaltiger Energieversorgung. Menschen bündeln ihre
            Ressourcen und Fachkenntnisse, um erneuerbare Energie zum
            endgültigen Durchbruch zu verhelfen.
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="/statut.webp" showMore={false} title="Vereinsstatuten">
        <div>
            <a
                target="_blank"
                href="https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf"
            >
                Statuten des Vereins Erneuerbare-Energie-Gemeinschaft ISCHLSTROM
                als pdf herunterladen</a
            >
        </div>
    </Project>
</div>

<div class="flex place-content-center mt-4">

    <Fab label="Jetzt Mitmachen" href="/mitmachen" target="_self" />

</div>
