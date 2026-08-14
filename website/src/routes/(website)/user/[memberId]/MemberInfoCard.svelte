<script>
    import { Card, Badge, Heading } from "flowbite-svelte";
    import { formatDate } from "$lib/format";

    let { user, measurementPoints = [] } = $props();

    // Zählpunkt-Status in Alltagssprache (gleiche Gruppierung wie in der
    // Mitgliederübersicht des Vorstandsbereichs)
    /** @returns {{ label: string, color: 'green' | 'gray' | 'yellow' }} */
    const statusInfo = (/** @type {string} */ status) => {
        if (status === "ACTIVE") {
            return { label: "aktiv", color: "green" };
        }
        if (["INACTIVE", "REJECTED"].includes(status)) {
            return { label: "beendet", color: "gray" };
        }
        return { label: "Aktivierung ausständig", color: "yellow" };
    };

    const typeLabel = (/** @type {string} */ type) =>
        type === "GENERATION" ? "Erzeugung (Einspeisung)" : "Verbrauch (Bezug)";
</script>

<Card class="max-w-full mt-4">
    <Heading tag="h6" class="text-primary-600 mb-3">Meine Stammdaten</Heading>

    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div>
            <dt class="text-gray-500 dark:text-gray-400">Name</dt>
            <dd class="font-medium text-gray-900 dark:text-white">
                {user.name}
            </dd>
        </div>
        <div>
            <dt class="text-gray-500 dark:text-gray-400">Adresse</dt>
            <dd class="font-medium text-gray-900 dark:text-white">
                {user.street}
                {user.hnr}, {user.zip}
                {user.city}
            </dd>
        </div>
        <div>
            <dt class="text-gray-500 dark:text-gray-400">E-Mail-Adresse</dt>
            <dd class="font-medium text-gray-900 dark:text-white break-all">
                {user.email}
            </dd>
        </div>
        {#if user.member_since}
            <div>
                <dt class="text-gray-500 dark:text-gray-400">Mitglied seit</dt>
                <dd class="font-medium text-gray-900 dark:text-white">
                    {formatDate(new Date(user.member_since))}
                </dd>
            </div>
        {/if}
    </dl>

    {#if measurementPoints.length > 0}
        <p class="text-gray-500 dark:text-gray-400 text-sm mt-4 mb-1">
            Zählpunkte
        </p>
        <ul class="space-y-2">
            {#each measurementPoints as point}
                <li
                    class="flex flex-wrap items-center gap-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg p-2"
                >
                    <span
                        class="font-mono text-xs break-all text-gray-900 dark:text-white"
                        >{point.identifier}</span
                    >
                    <span class="text-gray-500 dark:text-gray-400"
                        >{typeLabel(point.type)}</span
                    >
                    <Badge color={statusInfo(point.status).color}
                        >{statusInfo(point.status).label}</Badge
                    >
                </li>
            {/each}
        </ul>
    {/if}

    <p class="text-sm text-gray-500 dark:text-gray-400 mt-4">
        Stimmt etwas nicht oder hat sich etwas geändert? Schreiben Sie uns
        bitte an
        <a
            class="text-primary-600 underline"
            href="mailto:info@ischlstrom.org">info@ischlstrom.org</a
        > &ndash; wir kümmern uns darum.
    </p>
</Card>
