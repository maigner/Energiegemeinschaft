<script>
    import { Blockquote } from "flowbite-svelte";
    import { Listgroup } from "flowbite-svelte";
    let links = [
        {
            name: "Entwicklung Energie",
            href: "/board/energy/overview",
        },
        {
            name: "Mitglieder",
            href: "/board/members",
        },
        { name: "Bewerbungen", href: "/board/approve" },
        { name: "Dokumente", href: "/board/files" },
        {
            name: "Karte",
            href: "/board/map",
        },
    ];
    export let data;
</script>

{#if data.boardMember}
    <div class="max-w-xl m-auto justify-center">
        <figure class="m-4 text-center">
            
            <figcaption class="flex justify-center items-center mt-6 space-x-3">
                <div
                    class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
                >
                    <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                        >Angemeldet</cite
                    >
                    <cite
                        class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                        >{data.boardMember.name}</cite
                    >
                </div>
            </figcaption>
        </figure>
    </div>

    <div class="max-w-xl m-auto justify-center flex">
        <Listgroup active items={links} let:item class="w-48">
            {item.name}
        </Listgroup>
    </div>
{/if}
