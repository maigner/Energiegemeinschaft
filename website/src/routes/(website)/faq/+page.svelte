<script>
    import Fab from "$lib/Fab.svelte";
    import {
        Accordion,
        AccordionItem,
        Blockquote,
        Heading,
    } from "flowbite-svelte";
    import { getFaqCategories } from "./faq.js";

    let { data } = $props();

    let categories = $derived(getFaqCategories(data.batteryGoal));

    // FAQPage-Markup (schema.org), damit Suchmaschinen die Fragen direkt
    // als Rich Snippets anzeigen koennen.
    let jsonLd = $derived(
        JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: categories.flatMap((category) =>
                category.questions.map((qa) => ({
                    "@type": "Question",
                    name: qa.question,
                    acceptedAnswer: { "@type": "Answer", text: qa.answer },
                })),
            ),
        }),
    );
</script>

<svelte:head>
    <title>ISCHLSTROM - Häufig gestellte Fragen</title>
    <meta
        name="description"
        content="Antworten auf häufige Fragen zur Energiegemeinschaft ISCHLSTROM: Mitmachen, Kosten und Abrechnung, Batteriemanagement, Prognose und Verein."
    />
    {@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>

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

<!-- Sprungleiste -->
<nav class="flex flex-wrap justify-center gap-2 mt-6 px-4">
    {#each categories as category}
        <a
            href={`#${category.id}`}
            class="rounded-full border border-gray-200 dark:border-gray-700 px-4 py-1.5 text-sm text-gray-700 dark:text-gray-400 hover:border-primary-600 hover:text-primary-600 dark:hover:border-primary-500 dark:hover:text-primary-500"
        >
            {category.title}
        </a>
    {/each}
</nav>

<div class="max-w-2xl mx-auto mt-8 px-4">
    {#each categories as category}
        <section id={category.id} class="mt-10 scroll-mt-24">
            <Heading
                tag="h3"
                class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4"
            >
                {category.title}
            </Heading>
            <Accordion>
                {#each category.questions as qa}
                    <AccordionItem>
                        {#snippet header()}{qa.question}{/snippet}
                        <p class="mb-2 text-gray-500 dark:text-gray-400">
                            {qa.answer}
                        </p>
                        {#if qa.link}
                            <a
                                href={qa.link}
                                class="text-primary-600 dark:text-primary-500 hover:underline"
                                >{qa.linkLabel}</a
                            >
                        {/if}
                        {#if qa.source}
                            <a
                                href={qa.source}
                                target="_blank"
                                class="text-primary-600 dark:text-primary-500 hover:underline"
                                >Quelle</a
                            >
                        {/if}
                    </AccordionItem>
                {/each}
            </Accordion>
        </section>
    {/each}
</div>

<div class="flex place-content-center mt-12">
    <Fab label="Jetzt Mitmachen" href="/mitmachen" />
</div>

<div class="flex place-content-center mt-4">oder</div>

<div class="flex place-content-center mt-4">
    <Fab label="Ich habe immer noch Fragen!" href="/kontakt" />
</div>
