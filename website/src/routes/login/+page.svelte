<script>
    import { page } from "$app/stores";
    import { Card, Heading } from "flowbite-svelte";
    import { Button } from "flowbite-svelte";
    import { Label, Input, ButtonGroup } from "flowbite-svelte";
    import { EnvelopeSolid } from "flowbite-svelte-icons";
    
    import { signIn, signOut } from '@auth/sveltekit/client'

    export let data;

    let email = "";

    const handleEmailSignIn = () => {
        signIn('nodemailer', { email, callbackUrl: `${data.source}` });
        // signIn('nodemailer', { email });
    };

    const handleSignOut = () => {
        signOut();
    };
</script>

{JSON.stringify(data)}



{#if !$page.data.session}
    <div class="flex place-content-center">
        <Card class="m-2 max-w-3xl" size="xl">
            <Heading
                tag="h5"
                class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
            >
                E-Mail Anmeldung
            </Heading>

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

{#if $page.data.session}
    <div>
        <button on:click={handleSignOut}>Sign out</button>
    </div>
{/if}
