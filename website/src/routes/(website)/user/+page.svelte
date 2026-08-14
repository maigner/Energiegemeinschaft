<script>
    import { Heading, Listgroup } from "flowbite-svelte";

    let { data } = $props();

    /** @type {{ name: string; href: string; }[]} */
    let links = $derived(
        (data.users ?? []).map(
            (/** @type {{ name: any; street: any; hnr: any; identifier: any; }} */ user) => {
                return {
                    name: `${user.name}, ${user.street} ${user.hnr}`,
                    href: `/user/${user.identifier}`,
                };
            },
        ),
    );
</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-8">Meine Standorte</Heading>
</div>

<div class="text-center">
    <Heading tag="h6" class="text-primary-600 mt-8 mb-4"
        >Wählen Sie den Standort, dessen Daten Sie sehen möchten</Heading
    >
</div>

<div class="max-w-xl m-auto justify-center flex">
    <Listgroup active items={links} class="w-11/12"></Listgroup>
</div>
