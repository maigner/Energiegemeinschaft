<script>
    import { Heading } from "flowbite-svelte";
    import { Listgroup } from "flowbite-svelte";

    export let data;

    /** @type {[ { name: string; href: string;  } ]} */
    let links = data.users.map((/** @type {{ name: any; street: any; hnr: any; identifier: any; }} */ user) => {
        return {
            name: `${user.name}, ${user.street} ${user.hnr}`,
            href: `/user/${user.identifier}`,
        };
    });
</script>


<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-8">Meine Daten</Heading>
</div>

{#if data.users}
    <div class="text-center">
        <Heading tag="h6" class="text-primary-600 mt-8">Wählen Sie Ihren Standort</Heading>
    </div>

    <div class="max-w-xl m-auto justify-center flex">
        <Listgroup active items={links} let:item class="w-11/12">
            {item.name}
        </Listgroup>
    </div>
{/if}
