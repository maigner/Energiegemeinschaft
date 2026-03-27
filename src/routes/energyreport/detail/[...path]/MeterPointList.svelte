<!-- CustomStyling.svelte -->
<script lang="ts">
    import { JsonView } from "@zerodevx/svelte-json-view";
import { VirtualList } from "flowbite-svelte";

    interface User {
        id: string;
        name: string;
    }



    let { meterpoints } = $props();

    let items: User[] = $derived.by(() => {
        const array = Object.entries(meterpoints).map(([key, value]) => (
            {
                id: key,
                name: value.name,
                status: 'dirty data'
            }
        ));
        return array;
    });
</script>


<VirtualList
    items={items}
    minItemHeight={40}
    height={200}
    class="rounded-lg border"
>
    {#snippet children(item, index)}
        {@const user = item as User}
        <div
            class="flex items-center justify-between border-b p-4 transition-colors
             {index % 2 === 0
                ? 'bg-white dark:bg-gray-900'
                : 'bg-gray-50 dark:bg-gray-800'}
             hover:bg-blue-50 dark:hover:bg-blue-900/20"
            style="height:70px"
        >
            <div class="flex-1">
                <div class="font-medium text-gray-900 dark:text-white">
                    {user.id}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                    {user.name}
                </div>
            </div>
            <span
                class="rounded-full px-3 py-1 text-xs font-semibold
               {user.status === 'active'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : user.status === 'dirty data'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}"
            >
                {user.status}
            </span>
        </div>
    {/snippet}
</VirtualList>
