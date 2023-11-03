<script>
	import { LC_NUMERIC } from './../../../.svelte-kit/ambient.d.ts';
    import { Button, Checkbox, Input, Label, Modal, Skeleton } from "flowbite-svelte";
    let openModal = false;

    export let open;
</script>

<Modal
    title="Willkommen"
    bind:open
    size="xl"
    autoclose={false}
    dismissable={false}
    backdropClass='fixed inset-0 z-40 bg-gray-900 bg-opacity-95 dark:bg-opacity-95'
>
    <img src="header.png" class="mr-3 h-16 sm:h-20" alt="Logo" />

    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Unser Verein und unsere Webseite befinden sich gerade im Aufbau.
    </p>

    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Melden Sie sich an, um die Vorschau der Seite zu besuchen.
    </p>


    <form class="flex flex-col space-y-6" action="#">
        <h3 class="mb-4 text-xl font-medium text-gray-900 dark:text-white">
            Bitte melden Sie sich an
        </h3>
        <Label class="space-y-2">
            <span>Email</span>
            <Input
                type="email"
                name="email"
                placeholder="name@company.com"
                required
            />
        </Label>
        <Label class="space-y-2">
            <span>Passwort</span>
            <Input
                type="password"
                name="password"
                placeholder="•••••"
                required
            />
        </Label>
        <!--
        <div class="flex items-start">
            <Checkbox>Remember me</Checkbox>
            <a
                href="/"
                class="ml-auto text-sm text-primary-700 hover:underline dark:text-primary-500"
            >
                Passwort vergessen?
            </a>
        </div>
        -->
        <Button type="submit" class="">Anmelden</Button>
        <!--
        <div class="text-sm font-medium text-gray-500 dark:text-gray-300">
            Not registered? <a
                href="/"
                class="text-primary-700 hover:underline dark:text-primary-500"
            >
                Create account
            </a>
        </div>
        -->
    </form>


    <p class="text-base leading-relaxed text-gray-500 dark:text-gray-400">
        Ihre Daten werden unter keinen Umständen an Dritte weitergegeben und werden
        ausschöießlich zu technischen Zwecken erhoben.
    </p>


    <svelte:fragment slot="footer">
        <!--
        <Button>I accept</Button>
        <Button color="alternative">Decline</Button>
        -->
    </svelte:fragment>
</Modal>
