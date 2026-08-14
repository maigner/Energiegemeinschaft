<script>

    import { Button, Heading } from "flowbite-svelte";
    import Application from "./Application.svelte";

    let { data } = $props();

    let applicationData = $state(data.applicationData);

    let showForm = $state(data.existingApplications.length === 0);
</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-6"
        >Hallo {data.session?.user?.email}</Heading
    >
    <p class="mt-8">
        Sie sind nun auf unserer Webseite mit dieser E-Mail-Adresse angemeldet.
    </p>

    {#if showForm}
        <p class="mt-8">Aktuell sind Sie aber noch kein Mitglied von ISCHLSTROM.</p>

        <p class="mt-8">
            Wenn Sie Teil dieser Energiegemeinschaft werden möchten, dann füllen
            Sie bitte den folgenden Beitrittsantrag aus und klicken danach auf
            "Antrag abschicken".
        </p>
    {:else}
        <p class="mt-8">
            Ihr Beitrittsantrag vom {data.existingApplications[0].createdAtLabel} ist bei uns eingegangen.
        </p>

        <p class="mt-8">
            Der Vorstand prüft Ihren Antrag und meldet sich bei Ihnen.
            Sie müssen nichts weiter tun.
        </p>

        <p class="mt-8">
            Möchten Sie einen weiteren Standort anmelden, können Sie einen
            zusätzlichen Antrag ausfüllen.
        </p>

        <div class="mt-4">
            <Button pill onclick={() => (showForm = true)}>
                Weiteren Antrag ausfüllen
            </Button>
        </div>
    {/if}

</div>


{#if showForm}
    <Application { data } bind:applicationData />
{/if}
