<script>
    import { Card, Heading } from "flowbite-svelte";
    import { Button } from "flowbite-svelte";
    import { Label, Input, ButtonGroup } from "flowbite-svelte";
    import { EnvelopeSolid } from "flowbite-svelte-icons";

    // @ts-ignore
    import { signIn, signOut } from "@auth/sveltekit/client";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { browser } from "$app/environment";
    import { goto } from "$app/navigation";

    export let data;

    let email = "";

    const handleEmailSignIn = () => {
        signIn("nodemailer", { email, callbackUrl: `${data.source}` });
    };

    const handleSignOut = () => {
        signOut();
    };
</script>

{#if !data.session}
    <div class="flex place-content-center">
        <Card class="m-2 max-w-3xl" size="xl">
            <Heading
                tag="h5"
                class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
            >
                E-Mail Anmeldung
            </Heading>

            <p class="mt-4">
                Wir überprüfen Ihre Identität anhand Ihrer E-Mail Adresse. Sie müssen dafür kein Passwort für ischlstrom.org festlegen.
            </p>

            <p class="mt-4 mb-8">
                Sie finden nach Eingabe Ihrer E-Mail Adresse einen Zugangslink in Ihren Postfach.
            </p>

            <p
                class="mb-3 font-normal text-gray-700 dark:text-gray-400 leading-tight"
            >
                <Label for="input-group-1" class="block mb-2"
                    >Geben Sie Ihre E-Mail Adresse ein</Label
                >
                <Input
                    bind:value={email}
                    id="email"
                    type="email"
                    placeholder="name@provider.com"
                >
                    <EnvelopeSolid
                        slot="left"
                        class="w-5 h-5 text-gray-500 dark:text-gray-400"
                    />
                </Input>
            </p>

            <Button on:click={handleEmailSignIn}>Senden</Button>
        </Card>
    </div>
{/if}


{#if data.session?.user?.email && data.communityMembers === null}
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
{/if}

{#if data.session}
    <div class="mt-96">
        <button on:click={handleSignOut}>Sign out</button>
    </div>
{/if}
