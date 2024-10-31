<script>
    import { goto } from "$app/navigation";
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

    if (links.length === 1) {
        // no selection necessary
        goto(links[0].href);
    }

</script>


<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-8">Meine Daten</Heading>
</div>

{#if data.users}
    <div class="text-center">
        <Heading tag="h6" class="text-primary-600 mt-8 mb-4">Wählen Sie Ihren Standort</Heading>
    </div>

    <div class="max-w-xl m-auto justify-center flex">
        <Listgroup active items={links} let:item class="w-11/12">
            
            <span class="text-xl">
                {item.name}
            </span>
        </Listgroup>
    </div>
{/if}
