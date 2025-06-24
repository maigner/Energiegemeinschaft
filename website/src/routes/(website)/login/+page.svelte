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

    let { data } = $props();

    let email = $state("");

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
                Wir überprüfen Ihre Identität anhand Ihrer E-Mail-Adresse. Sie müssen dafür kein Passwort für ischlstrom.org festlegen.
            </p>

            <p class="mt-4 mb-8">
                Geben Sie bitte Ihre E-Mail-Adresse ein und klicken Sie auf "Senden".
                Sie finden danach einen Zugangslink in Ihren Postfach.
            </p>

            <p
                class="mb-3 font-normal text-gray-700 dark:text-gray-400 leading-tight"
            >
                <Label for="input-group-1" class="block mb-2"
                    >Geben Sie Ihre E-Mail-Adresse ein</Label
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

            <Button onclick={handleEmailSignIn}>Senden</Button>
        </Card>
    </div>
{/if}

<!-- TODO: remove after refactoring /user/onboarding -->
{#if data.session?.user?.email}
    <div class="text-center">
        <Heading tag="h3" class="text-primary-600 mt-6"
            >Hallo {data.session?.user?.email}</Heading
        >
        <p class="mt-8">
            Sie sind auf unserer Webseite mit dieser E-Mail-Adresse angemeldet.
        </p>



        <Button class="mt-8" onclick={() => {
            if (browser) {
                goto("/user");
            }
        }}>Mein Bereich</Button>
    </div>
{/if}

{#if data.session}
    <div class="mt-96">
        <button onclick={handleSignOut}>Sign out</button>
    </div>
{/if}
