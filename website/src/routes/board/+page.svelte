<script>
    import { Blockquote } from 'flowbite-svelte';

    export let data;
</script>

{#if data.member}
    <div class="max-w-xl m-auto justify-center">
        <figure class="m-4 text-center">
            <Blockquote alignment="center" size="xl" class="text-gray-900">
                Vorstandsbereich
            </Blockquote>
            <figcaption class="flex justify-center items-center mt-6 space-x-3">
                <div
                    class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
                >
                    <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                        >Angemeldet</cite
                    >
                    <cite
                        class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                        >{data.member.name}</cite
                    >
                </div>
            </figcaption>
        </figure>
    </div>
{/if}
