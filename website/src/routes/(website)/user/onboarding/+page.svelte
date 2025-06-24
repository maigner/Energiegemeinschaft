<script>

    import {  Heading } from "flowbite-svelte";
    import Application from "./Application.svelte";

    let { data } = $props();

    let applicationData = $state(data.applicationData);
</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-6"
        >Hallo {data.session?.user?.email}</Heading
    >
    <p class="mt-8">
        Sie sind nun auf unserer Webseite mit dieser E-Mail-Adresse angemeldet.
    </p>

    <p class="mt-8">Aktuell sind Sie aber noch kein Mitglied von ISCHLSTROM.</p>

    <p class="mt-8">
        Wenn Sie Teil dieser Energiegemeinschaft werden möchten, dann füllen
        Sie bitte das folgende Bewerbungsformular aus und klicken danach auf "Bewerbung abschicken".
    </p>



</div>



<Application { data } bind:applicationData />