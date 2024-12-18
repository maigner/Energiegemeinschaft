<script>
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Button, Heading } from "flowbite-svelte";

    export let data;

</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-6"
        >Hallo {data.session?.user?.email}</Heading
    >
    <p class="mt-8">
        Sie sind nun auf unserer Webseite mit dieser E-Mailadresse angemeldet.
    </p>

    <p class="mt-8">
        Aktuell sind Sie aber noch kein Mitglied von ISCHLSTROM.
    </p>

    <p class="mt-8">
        Wenn Sie Teil dieser Energiegemeinschaft werden möchten, dann klicken Sie auf folgenden Button um das Bewerbungsformular zu öffnen.
    </p>

    <Button class="mt-8" on:click={() => {
        if (browser) {
            goto("https://forms.gle/dQMJmEeZp3bML4jP6");
        }
    }}>Zur Bewerbung</Button>
</div>