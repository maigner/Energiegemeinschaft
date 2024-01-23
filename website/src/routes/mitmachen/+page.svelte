<script>
    import Project from "$lib/Project.svelte";
    import { Button, Card, Heading } from "flowbite-svelte";


    // TODO: check list
    export let data;

    
</script>

{JSON.stringify(data.members)}

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
                Hilfe bekommen Sie bei NetzOÖ unter der Service-Hotline 05 9070
            </p>
        </div>
    </Project>
</div>

