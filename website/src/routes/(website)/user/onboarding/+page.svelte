<script>
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Button, Heading } from "flowbite-svelte";
    import Application from "./Application.svelte";

    export let data;
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



<Application bind:data />