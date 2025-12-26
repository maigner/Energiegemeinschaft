<script>
    import Fab from "$lib/Fab.svelte";
    import Project from "$lib/Project.svelte";
    import { Blockquote, TabItem, Tabs } from "flowbite-svelte";
    //import { JSONEditor } from "svelte-jsoneditor";
    import { AccordionItem, Accordion } from "flowbite-svelte";

    let { data } = $props();

    const faqCosts = [
        {
            question:
                "Sind die Stromkosten in Brutto- oder Nettopreisen angegeben?",
            answer: "Es handelt sich um Nettopreise. Unser Umsatz ist unter den Grenzen zur Umsatzsteuerpflicht.",
        },
        {
            question: "Wie viel wird bei den Netzkosten eingespart?",
            answer: "Wir sind eine regionale EEG, weshalb sich die Netzkosten für jede verteilte kWh um 28% reduzieren.",
            source: "https://energiegemeinschaften.gv.at/formen-von-energiegemeinschaften/",
        },
        {
            question: "Wie hoch ist der aktuelle Einspeisetarif?",
            answer: "9,5 cent/kWh (ab 1.1.2026)",
        },
        {
            question: "Wie hoch ist der aktuelle Bezugstarif?",
            answer: "10 cent/kWh (ab 1.1.2026)",
        },
        {
            question: "Wie hoch ist der Mitgliedsbeitrag?",
            answer: "Ab 1.1.2026 fällt kein Mitgliedsbeitrag mehr an.",
        },
        
    ];
    const faqCommon = [
        {
            question:
                "Muss/darf/soll bei einem Beitritt zu Ischlstrom der derzeitige Energielieferant bzw. - abnehmer gekündigt werden?",
            answer: "Keinesfalls. Sie benötigen weiter hin einen Lieferanten bzw. Abnehmer, der Sie mit Energie auch dann versorgt bzw. Ihnen abnimmt, wenn durch die Mitglieder von Ischlstrom zu wenig Sonnenstrom produziert wird, bzw. zu wenig Bedarf an Sonnenstrom durch die Ischlstrom – Mitglieder besteht.",
        },
        {
            question: "Wie ist der Verein strukturiert?",
            answer: "ISCHL STROM ist NICHT auf Gewinn ausgerichtet. Alle Details finden sich in den Statuten.",
            source: "https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf",
        },
        {
            question: "Wie wird der Strompreis festgelegt?",
            answer: "Die Mitglieder stimmen in der Generalversammlung über einen Vorschlag des Vereinsvorstandes ab.",
        },
    ];
</script>

<!--
    <JSONEditor bind:content />
-->

<div class="max-w-xl m-auto justify-center">
    <figure class="m-4 text-center">
        <Blockquote alignment="center" size="xl" class="text-gray-900">
            Häufig gestellte Fragen
        </Blockquote>
        <figcaption class="flex justify-center items-center mt-6 space-x-3">
            <div
                class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
            >
                <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                    >Wir lernen aus den Fragen</cite
                >
                <cite
                    class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                    >die Sie uns stellen</cite
                >
            </div>
        </figcaption>
    </figure>
</div>

<div class="flex place-content-center mt-10">
    <Project img="/faq.webp" showMore={false} title="Fragen und Antworten">
        <div>
            <Tabs>
                <TabItem open title="Allgemeines">
                    <Accordion>
                        {#each faqCommon as qa}
                            <AccordionItem>
                                {#snippet header()}{qa.question}{/snippet}
                                <p
                                    class="mb-2 text-gray-500 dark:text-gray-400"
                                >
                                    {qa.answer}
                                </p>
                                {#if qa.source}
                                    <a href={qa.source} target="_blank"
                                        >Quelle</a
                                    >
                                {/if}
                            </AccordionItem>
                        {/each}
                    </Accordion>
                </TabItem>

                <TabItem title="Kosten">
                    <Accordion>
                        {#each faqCosts as qa}
                            <AccordionItem>
                                {#snippet header()}{qa.question}{/snippet}
                                <p
                                    class="mb-2 text-gray-500 dark:text-gray-400"
                                >
                                    {qa.answer}
                                </p>
                                {#if qa.source}
                                    <a href={qa.source} target="_blank"
                                        >Quelle</a
                                    >
                                {/if}
                            </AccordionItem>
                        {/each}
                    </Accordion>
                </TabItem>
            </Tabs>
        </div>
    </Project>
</div>

<div class="flex place-content-center mt-10">
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
    <Fab label="Jetzt Mitmachen" href="/mitmachen" />
</div>

<div class="flex place-content-center mt-4">oder</div>

<div class="flex place-content-center mt-4">
    <Fab label="Ich habe immer noch Fragen!" href="/kontakt" />
</div>
