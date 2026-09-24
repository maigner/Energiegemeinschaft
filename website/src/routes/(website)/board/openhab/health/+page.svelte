<script>
    import { onMount } from "svelte";
    import { invalidateAll } from "$app/navigation";
    import {
        Badge,
        Button,
        Card,
        Heading,
        Table,
        TableHead,
        TableHeadCell,
        TableBody,
        TableBodyRow,
        TableBodyCell,
    } from "flowbite-svelte";
    import { CHECKS, LEVEL_ORDER } from "$lib/ibmHealth";

    let { data } = $props();

    // Die Anlagen melden minuetlich, der Handshake-Stempel kommt minuetlich:
    // die Seite holt sich den Stand jede Minute neu.
    onMount(() => {
        const timer = setInterval(() => invalidateAll(), 60 * 1000);
        return () => clearInterval(timer);
    });

    /** @type {Record<string, "green" | "yellow" | "red" | "blue" | "gray">} */
    const levelColor = {
        ok: "green",
        info: "blue",
        warn: "yellow",
        crit: "red",
        unknown: "gray",
    };
    /** @type {Record<string, string>} Punktfarben der Server-Seite */
    const levelDot = {
        ok: "bg-green-500",
        info: "bg-blue-500",
        warn: "bg-yellow-400",
        crit: "bg-red-500",
        unknown: "bg-gray-400",
    };
    /** @type {Record<string, string>} */
    const levelLabel = {
        ok: "in Ordnung",
        info: "Hinweis",
        warn: "Warnung",
        crit: "kritisch",
        unknown: "keine Daten",
    };

    let plants = $derived(data.plants ?? []);
    let fleet = $derived(data.fleet ?? []);

    let counts = $derived({
        crit: plants.filter((/** @type {any} */ p) => p.worst === "crit").length,
        warn: plants.filter((/** @type {any} */ p) => p.worst === "warn").length,
        ok: plants.filter((/** @type {any} */ p) => p.worst === "ok" || p.worst === "info").length,
    });

    /**
     * Alles, was Aufmerksamkeit braucht, in einer Liste: kritisch zuerst,
     * dann Warnungen; Flottenpruefungen vor den Anlagen.
     * @type {{ scope: string, href: string | null, check: any }[]}
     */
    let attention = $derived(
        [
            ...fleet
                .filter((/** @type {any} */ c) => c.level === "crit" || c.level === "warn")
                .map((/** @type {any} */ c) => ({ scope: "Flotte", href: null, check: c })),
            ...plants.flatMap((/** @type {any} */ p) =>
                p.checks
                    .filter((/** @type {any} */ c) => c.level === "crit" || c.level === "warn")
                    .map((/** @type {any} */ c) => ({ scope: p.name, href: `/board/openhab/${p.id}`, check: c })),
            ),
        ].sort(
            (a, b) =>
                LEVEL_ORDER.indexOf(b.check.level) - LEVEL_ORDER.indexOf(a.check.level) ||
                a.scope.localeCompare(b.scope, "de"),
        ),
    );

    /** @param {string} iso */
    function formatTime(iso) {
        return new Date(iso).toLocaleString("de-AT", {
            timeZone: "Europe/Vienna",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
</script>

<div class="p-4 max-w-7xl mx-auto">
    <div class="flex flex-wrap items-center gap-4 mb-6">
        <Heading tag="h1" class="text-2xl font-semibold w-auto">Flotten-Gesundheit</Heading>
        <Badge color={counts.crit > 0 ? "red" : counts.warn > 0 ? "yellow" : "green"} large>
            {plants.length} Anlagen · {counts.crit} kritisch · {counts.warn} mit Warnung
        </Badge>
        <span class="text-sm text-gray-500 dark:text-gray-400">Stand {formatTime(data.generatedAt)}, KW {data.week}</span>
        <Button size="xs" color="light" href="/board/openhab">Zur Anlagenübersicht</Button>
    </div>

    <!-- Handlungsbedarf -->
    <Card class="max-w-none mb-8">
        <Heading tag="h2" class="text-lg font-semibold mb-3">Handlungsbedarf</Heading>
        {#if attention.length === 0}
            <p class="text-sm text-green-700 dark:text-green-400">Nichts offen: alle Anlagen und die Server-Seite sind unauffällig.</p>
        {:else}
            <ul class="space-y-2">
                {#each attention as item}
                    <li class="flex flex-wrap items-baseline gap-2 text-sm">
                        <Badge color={levelColor[item.check.level]}>{levelLabel[item.check.level]}</Badge>
                        {#if item.href}
                            <a href={item.href} class="font-semibold underline dark:text-white">{item.scope}</a>
                        {:else}
                            <span class="font-semibold dark:text-white">{item.scope}</span>
                        {/if}
                        <span class="text-gray-500 dark:text-gray-400">{item.check.label}:</span>
                        <span class="dark:text-gray-200">{item.check.text}</span>
                        {#if item.check.detail && item.check.detail !== item.check.text}
                            <span class="text-gray-500 dark:text-gray-400">– {item.check.detail}</span>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </Card>

    <!-- Server-Seite -->
    <Card class="max-w-none mb-8">
        <Heading tag="h2" class="text-lg font-semibold mb-3">Server-Seite (gilt für alle Anlagen)</Heading>
        <dl class="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr] text-sm">
            {#each fleet as c}
                <dt class="flex items-center gap-2 font-medium dark:text-white">
                    <span class={`inline-block h-3 w-3 rounded-full ${levelDot[c.level]}`} title={levelLabel[c.level]}></span>
                    {c.label}
                </dt>
                <dd class="dark:text-gray-200">
                    {c.text}
                    {#if c.detail}
                        <span class="text-gray-500 dark:text-gray-400">– {c.detail}</span>
                    {/if}
                </dd>
            {/each}
        </dl>
        {#if data.serverIbmVersion}
            <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">Ausgeliefertes IBM-Paket: {data.serverIbmVersion}</p>
        {/if}
    </Card>

    <!-- Matrix -->
    {#if plants.length === 0}
        <Card class="max-w-xl">
            <p class="text-sm">Noch keine Anlagen angelegt.</p>
        </Card>
    {:else}
        <div class="overflow-x-auto">
            <Table striped class="text-xs">
                <TableHead>
                    <TableHeadCell class="whitespace-nowrap">Anlage</TableHeadCell>
                    {#each CHECKS as col}
                        <TableHeadCell class="whitespace-nowrap" title={col.title}>{col.label}</TableHeadCell>
                    {/each}
                </TableHead>
                <TableBody>
                    {#each plants as p (p.id)}
                        <TableBodyRow>
                            <TableBodyCell class="whitespace-nowrap align-top">
                                <a href={`/board/openhab/${p.id}`} class="font-semibold underline dark:text-white">{p.name}</a>
                                <div class="text-gray-500 dark:text-gray-400">{p.memberIdentifier} · {p.memberName}</div>
                            </TableBodyCell>
                            {#each CHECKS as col}
                                {@const c = p.checks.find((/** @type {any} */ x) => x.key === col.key)}
                                <TableBodyCell class="align-top">
                                    {#if c}
                                        <Badge color={levelColor[c.level]} title={c.detail ?? c.text} class="whitespace-normal text-left">
                                            {c.text}
                                        </Badge>
                                    {:else}
                                        <Badge color="gray">-</Badge>
                                    {/if}
                                </TableBodyCell>
                            {/each}
                        </TableBodyRow>
                    {/each}
                </TableBody>
            </Table>
        </div>
        <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Farben: grün in Ordnung, blau Hinweis, gelb ansehen, rot handeln, grau keine Daten.
            Spaltenüberschriften und Felder tragen Erklärungen als Tooltip. Die Bewertung steht in
            <code>src/lib/ibmHealth.js</code>; die Tunnel-Spalte braucht den Handshake-Stempel des Timers
            ibm-provision-sync auf s1 (Migration 0038).
        </p>
    {/if}
</div>
