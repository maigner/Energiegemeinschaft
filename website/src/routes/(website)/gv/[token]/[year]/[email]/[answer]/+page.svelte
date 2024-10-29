<script>
    import { Heading } from "flowbite-svelte";
    export let data;
</script>

{#if data.error}
    {data.error}
{:else}
    <div class="text-center">
        {#if data.answer === "yes"}
            <Heading tag="h1" class="text-primary-600 mt-8">Danke!</Heading>

            <p class="mt-8">Für Ihre Anmeldung zur Generalversammlung 2024</p>

            <p class="mt-4">
                {data.newsletterEmail}
            </p>

            <p class="mt-8">
                Sollte Ihre Anmeldung ein Versehen gewesen sein, dann lassen Sie
                uns das bitte formlos via info@ischlstrom.org wissen.
            </p>

            <p class="mt-16">Ihr Vorstand von ISCHLSTROM</p>
        {:else if data.answer === "no"}
            <p class="mt-8">Für Ihre Abmeldung von der Generalversammlung 2024</p>

            <p class="mt-4">
                {data.newsletterEmail}
            </p>

            <p class="mt-8">
                Sollte Ihre Abmeldung ein Versehen gewesen sein, dann lassen Sie
                uns das bitte formlos via info@ischlstrom.org wissen.
            </p>

            <p class="mt-16">Ihr Vorstand von ISCHLSTROM</p>
        {:else}
            ihre Antwort wurde nicht verstanden
        {/if}
    </div>
{/if}
