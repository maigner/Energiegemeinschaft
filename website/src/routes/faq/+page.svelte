<script>
    import Project from "$lib/Project.svelte";
    import Fab, { Label } from "@smui/fab";
    import { Blockquote, Heading, TabItem, Tabs } from "flowbite-svelte";
    //import { JSONEditor } from "svelte-jsoneditor";
    import { AccordionItem, Accordion } from 'flowbite-svelte';

    export let data;

    let content = { json: data };


    const faqCosts = [
        {
            question: "Sind die Stromkosten in Brutto- oder Nettopreisen angegeben?",
            answer: "Es handelt sich um Nettopreise. Unser Umsatz ist unter den Grenzen zur Umsatzsteuerpflicht."
        },
        {
            question: "Wie viel wird bei den Netzkosten eingespart?",
            answer: "Wir sind eine regionale EEG, weshalb sich die Netzkosten für jede verteilte kWh um 28% reduzieren.",
            source: "https://energiegemeinschaften.gv.at/formen-von-energiegemeinschaften/"
        },
        {
            question: "Wie hoch ist der aktuelle Einspeisetarif?",
            answer: "11 cent/kWh"
        },
        {
            question: "Wie hoch ist der aktuelle Bezugstarif?",
            answer: "11 cent/kWh"
        },
        {
            question: "Wie hoch ist der Mitgliedsbeitrag?",
            answer: "20 EURO pro Jahr, bzw. 5 EURO pro Quartal"
        }
    ]
    const faqCommon = [
        {
            question: "Wie ist der Verein strukturiert?",
            answer: "Alle Details finden sich in den Statuten.",
            source: "https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf"
        }
    ]

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
    <Project img="/faq.webp" showMore={false}>
        <span slot="title">Fragen und Antworten</span>
        <div slot="content">

            <Tabs>
                <TabItem open title="Kosten">
                    <Accordion>
                        {#each faqCosts as qa}
                            <AccordionItem>
                                <span slot="header">{qa.question}</span>
                                <p class="mb-2 text-gray-500 dark:text-gray-400">
                                    {qa.answer}
                                </p>
                                {#if qa.source}
                                    <a href={qa.source} target="_blank">Quelle</a>
                                {/if}
                            </AccordionItem>
                        {/each}
                    </Accordion>
                </TabItem>
                <TabItem title="Allgemeines">
                    <Accordion>
                        {#each faqCommon as qa}
                            <AccordionItem>
                                <span slot="header">{qa.question}</span>
                                <p class="mb-2 text-gray-500 dark:text-gray-400">
                                    {qa.answer}
                                </p>
                                {#if qa.source}
                                    <a href={qa.source} target="_blank">Quelle</a>
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
    <Project img="/statut.webp" showMore={false}>
        <span slot="title">Vereinsstatuten</span>
        <div slot="content">
            <a target="_blank" href="https://ischlstrom-website-files-public.s3.eu-central-1.amazonaws.com/231025+Statuten+ISCHLSTROM+FINAL+nach+Pr%C3%BCfung+Vereinsbeh%C3%B6rde.pdf">
                Statuten
                des Vereins
                Erneuerbare-Energie-Gemeinschaft
                ISCHLSTROM als pdf herunterladen</a>                
        </div>
    </Project>
</div>


<div class="flex place-content-center mt-4">
    <Fab extended href="/mitmachen" color="primary">
        <Label>Jetzt Mitmachen</Label>
    </Fab>
</div>

<div class="flex place-content-center mt-4">
    oder
</div>



<div class="flex place-content-center mt-4">
    <Fab extended href="/kontakt" color="primary">
        <Label>Ich habe immer noch Fragen!</Label>
    </Fab>
</div>

