<script>
    import { Card, Heading, Badge } from "flowbite-svelte";
    import { ArrowLeftOutline } from "flowbite-svelte-icons";
    import PerformanceChart from "../../../../user/[memberId]/PerformanceChart.svelte";

    export let data;
</script>

<svelte:head>
    <title>ISCHLSTROM - {data.user?.name ?? "Mitglied"}</title>
</svelte:head>

<div class="px-4 mt-4 max-w-4xl mx-auto flex flex-col gap-6">
    <a
        href="/board/members"
        class="flex items-center gap-1 text-sm text-primary-700 dark:text-primary-500 hover:underline"
    >
        <ArrowLeftOutline class="w-4 h-4" />
        Zurück zur Mitgliederliste
    </a>

    {#if data.user}
        <Card class="p-4 md:p-6" size="xl">
            <div class="flex items-center gap-3 mb-4">
                <Heading tag="h2" class="text-xl font-semibold w-auto">
                    {data.user.name}
                </Heading>
                <Badge>Nr. {data.user.identifier}</Badge>
            </div>

            <dl
                class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-gray-900 dark:text-white"
            >
                <div>
                    <dt class="text-sm text-gray-500 dark:text-gray-400">
                        Mitglied seit
                    </dt>
                    <dd>{data.user.memberSince}</dd>
                </div>
                <div>
                    <dt class="text-sm text-gray-500 dark:text-gray-400">
                        E-Mail
                    </dt>
                    <dd>
                        <a
                            href="mailto:{data.user.email}"
                            class="hover:underline"
                        >
                            {data.user.email}
                        </a>
                    </dd>
                </div>
                <div>
                    <dt class="text-sm text-gray-500 dark:text-gray-400">
                        Adresse
                    </dt>
                    <dd>
                        {data.user.street}
                        {data.user.hnr}, {data.user.zip}
                        {data.user.city}
                    </dd>
                </div>
            </dl>
        </Card>
    {/if}
</div>

{#if data.metricsTimestampRange}
    <PerformanceChart bind:data />
{:else}
    <p class="text-center text-gray-500 dark:text-gray-400 mt-8">
        Für dieses Mitglied liegen noch keine Energiedaten vor.
    </p>
{/if}
