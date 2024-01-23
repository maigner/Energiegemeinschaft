<script>
    import Project from "$lib/Project.svelte";
    import { Button, Card, Heading } from "flowbite-svelte";

    // TODO: check list
    export let data;

</script>


<div class="text-center">
    <Heading tag="h2">Willkommen</Heading>
</div>

<div class="flex place-content-center">
    <Card class="m-2 max-w-3xl" size="xl">

        <Heading tag="h5"
            class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
        >
            {data?.session?.user?.email}
        </Heading>

        <p
            class="mb-3 font-normal text-gray-700 dark:text-gray-400 leading-tight"
        >
            Add data here...
        </p>
        
    </Card>
</div>


<div class="flex place-content-center">
    <Project img="/smart_meter.webp" showMore={false}>
        <span slot="title">1. Stromzähler aktivieren</span>
        <div slot="content">
            <p class="mb-2">
                Ihr Netzbetreiber (z.B. NetzOÖ) hat möglicherweise Ihr Smartmeter noch nicht freigeschaltet.
            </p>
            
            <p class="mb-2">
                Registrieren Sie sich dazu im eService-Portal der Netz Oberösterreich 
                unter <a href="https://eservice.netzooe.at/app/login" target="_blank">https://eservice.netzooe.at/app/login</a>
            </p>
            <p class="mb-2">
                Finden Sie in der Übersicht des eService-Portals Ihren aktiven Zählpunkt. 
                Sie können auch mehrere aktive Zählpunkte haben. 
            </p>
            <p class="mb-2">
                Wenn Ihnen bei Ihrem Zählpunkt die Funktion "Smartmeter aktiven" angeboten wird, dann führen Sie diese aus. 
            </p>

            <p class="mb-2">
                Hilfe bekommen Sie bei NetzOÖ unter der Service-Hotline 05 9070
            </p>
        </div>
    </Project>
</div>

<div class="flex place-content-center">
    <Project img="/mailme_networkinfo.webp" showMore={false}>
        <span slot="title">2. NetzOÖ eService-Portal</span>
        <div slot="content">
            <p class="mb-2">
                Finden Sie das Briefsymbol und nutzen Sie diese Funktion um sich Ihre Zählpunktnummer 
                an Ihre E-Mail Adresse schicken zu lassen.
            </p>
            <p class="mb-2">
                Leiten Sie diese Daten einfach an uns weiter. Sie erreichen uns unter info@ischlstrom.org
            </p>
            <p class="mb-2">
                Wir schalten dann Ihre E-Mail Adresse für ischlstrom.org frei.
            </p>
        </div>
    </Project>
</div>

