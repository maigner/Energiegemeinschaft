<script>
    import { onMount } from "svelte";
    import { invalidateAll } from "$app/navigation";
    import { enhance } from "$app/forms";
    import {
        Card,
        Badge,
        Indicator,
        Progressbar,
        Heading,
        Button,
        Select,
        Table,
        TableHead,
        TableHeadCell,
        TableBody,
        TableBodyRow,
        TableBodyCell,
    } from "flowbite-svelte";

    import { compareVersions, newestVersion } from "$lib/versions";

    let { data, form } = $props();

    // Die Anlagen melden sich alle 5 Minuten; die Seite holt sich den
    // aktuellen Stand jede Minute neu.
    onMount(() => {
        const timer = setInterval(() => invalidateAll(), 60 * 1000);
        return () => clearInterval(timer);
    });

    const ONLINE_SECONDS = 15 * 60;
    const WARN_SECONDS = 60 * 60;

    /**
     * @param {{ ageSeconds: number | null }} anlage
     * @returns {"online" | "verspätet" | "offline" | "wartet"}
     */
    function statusOf(anlage) {
        if (anlage.ageSeconds === null) return "wartet";
        if (anlage.ageSeconds < ONLINE_SECONDS) return "online";
        if (anlage.ageSeconds < WARN_SECONDS) return "verspätet";
        return "offline";
    }

    /** @type {Record<"online" | "verspätet" | "offline" | "wartet", "green" | "yellow" | "red" | "gray">} */
    const statusColor = {
        online: "green",
        "verspätet": "yellow",
        offline: "red",
        wartet: "gray",
    };

    let statuses = $derived(data.statuses ?? []);
    let onlineCount = $derived(
        statuses.filter(
            (/** @type {{ ageSeconds: number | null }} */ s) =>
                statusOf(s) === "online",
        ).length,
    );

    // Neuester IBM-Paketstand der Flotte; Anlagen mit aelterem Stand werden
    // auf der Karte hervorgehoben.
    let newestIbm = $derived(
        newestVersion(
            statuses.map((/** @type {any} */ s) => s.data?.versions?.ibm),
        ),
    );

    let selectedMemberId = $state("");
    let memberOptions = $derived(
        (data.members ?? []).map(
            (/** @type {{ id: number, identifier: number, name: string }} */ m) => ({
                value: String(m.id),
                name: `${m.identifier}: ${m.name}`,
            }),
        ),
    );

    /** @param {string | Date | null} lastSeen */
    function formatLastSeen(lastSeen) {
        if (!lastSeen) return "-";
        return new Date(lastSeen).toLocaleString("de-AT", {
            timeZone: "Europe/Vienna",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    /** @param {number | null} seconds */
    function formatAge(seconds) {
        if (seconds === null) return "noch keine Meldung";
        if (seconds < 90) return "vor 1 Minute";
        if (seconds < 3600) return `vor ${Math.round(seconds / 60)} Minuten`;
        if (seconds < 172800) return `vor ${Math.round(seconds / 3600)} Stunden`;
        return `vor ${Math.round(seconds / 86400)} Tagen`;
    }

    /**
     * @param {unknown} value
     * @param {number} [digits]
     */
    function num(value, digits = 1) {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(digits) : null;
    }

    /**
     * @param {string | null | undefined} value
     * @returns {{ text: string, color: "green" | "gray" | "yellow" }}
     */
    function schalter(value) {
        if (value === "ON") return { text: "Ein", color: "green" };
        if (value === "OFF") return { text: "Aus", color: "gray" };
        return { text: "unbekannt", color: "yellow" };
    }

    /** @param {string} token */
    function copyToken(token) {
        navigator.clipboard?.writeText(token);
    }

    /**
     * Zählt die von der Anlage gemeldeten Logmeldungen (openHAB-Log der
     * letzten 24 Stunden) je Level; null, wenn die Anlage keine überträgt.
     * @param {any} data
     * @returns {{ errors: number, warnings: number } | null}
     */
    function logCounts(data) {
        if (!Array.isArray(data?.log_entries)) return null;
        let errors = 0;
        let warnings = 0;
        for (const entry of data.log_entries) {
            if (entry?.level === "ERROR") errors++;
            else if (entry?.level === "WARN") warnings++;
        }
        return { errors, warnings };
    }
</script>

<div class="p-4 max-w-7xl mx-auto">
    <div class="flex flex-wrap items-center gap-4 mb-6">
        <Heading tag="h1" class="text-2xl font-semibold w-auto">
            openHAB-Anlagen
        </Heading>
        <Badge color={onlineCount === statuses.length && statuses.length > 0 ? "green" : "yellow"} large>
            {onlineCount} von {statuses.length} online
        </Badge>
    </div>

    {#if statuses.length === 0}
        <Card class="max-w-xl mb-8">
            <p class="text-gray-600 dark:text-gray-300">
                Noch keine Anlage angelegt. Unten ein Token für ein Mitglied
                erstellen und bei der Einrichtung des openHABian angeben.
                Sobald die Anlage meldet, erscheint sie hier.
            </p>
        </Card>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {#each statuses as anlage (anlage.id)}
                {@const status = statusOf(anlage)}
                {@const d = anlage.data}
                {@const soc = num(d.soc, 0)}
                {@const haupt = schalter(d.hauptschalter)}
                {@const counts = logCounts(d)}
                <Card
                    href={`/board/openhab/${anlage.id}`}
                    class="max-w-none p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <Indicator color={statusColor[status]} />
                            <span class="text-lg font-semibold dark:text-white">
                                {anlage.name || `Anlage von ${anlage.memberName}`}
                            </span>
                        </div>
                        <Badge color={statusColor[status]}>{status}</Badge>
                    </div>

                    <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        Mitglied: {anlage.memberName}
                    </p>

                    {#if status === "wartet"}
                        <p class="text-sm text-gray-600 dark:text-gray-300">
                            Diese Anlage hat noch keine Daten gemeldet. Das
                            Token unten bei der Einrichtung des openHABian
                            angeben.
                        </p>
                    {:else}
                        <div class="mb-3">
                            <div class="flex justify-between text-sm mb-1">
                                <span class="text-gray-600 dark:text-gray-300">Batterie-Ladestand</span>
                                <span class="font-medium dark:text-white">
                                    {soc !== null ? `${soc}%` : "-"}
                                </span>
                            </div>
                            <Progressbar progress={soc ?? 0} color={Number(soc) < 20 ? "red" : "green"} />
                        </div>

                        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <span class="text-gray-600 dark:text-gray-300">Wechselrichter</span>
                            <span class="text-right">
                                <Badge color={d.inverter_status === "ONLINE" ? "green" : "red"}>
                                    {d.inverter_status ?? "unbekannt"}
                                </Badge>
                            </span>

                            <span class="text-gray-600 dark:text-gray-300">Batteriemanagement</span>
                            <span class="text-right">
                                <Badge color={haupt.color}>{haupt.text}</Badge>
                            </span>

                            <span class="text-gray-600 dark:text-gray-300">Ladesperre</span>
                            <span class="text-right dark:text-white">{schalter(d.ladesperre_aktiv).text}</span>

                            <span class="text-gray-600 dark:text-gray-300">Entladung</span>
                            <span class="text-right dark:text-white">{schalter(d.entladung_aktiv).text}</span>

                            <span class="text-gray-600 dark:text-gray-300">Kapazität (geschätzt)</span>
                            <span class="text-right dark:text-white">
                                {num(d.batterie_kapazitaet) !== null ? `${num(d.batterie_kapazitaet)} kWh` : "-"}
                            </span>

                            <span class="text-gray-600 dark:text-gray-300">Entladeleistung</span>
                            <span class="text-right dark:text-white">
                                {num(d.min_entladeleistung_w, 0) !== null && num(d.max_entladeleistung_w, 0) !== null
                                    ? `${num(d.min_entladeleistung_w, 0)} bis ${num(d.max_entladeleistung_w, 0)} W`
                                    : "-"}
                            </span>

                            <span class="text-gray-600 dark:text-gray-300">Wolkenvorschau</span>
                            <span class="text-right dark:text-white">
                                {num(d.wolkenvorschau, 0) !== null ? `${num(d.wolkenvorschau, 0)}%` : "-"}
                            </span>

                            <span class="text-gray-600 dark:text-gray-300">IBM-Paket</span>
                            <span class="text-right">
                                {#if !d.versions?.ibm}
                                    <span class="dark:text-white">-</span>
                                {:else if newestIbm && compareVersions(d.versions.ibm, newestIbm) < 0}
                                    <Badge color="yellow">{d.versions.ibm} · veraltet</Badge>
                                {:else}
                                    <span class="dark:text-white">{d.versions.ibm}</span>
                                {/if}
                            </span>

                            <span class="text-gray-600 dark:text-gray-300">Log (24 h)</span>
                            <span class="text-right">
                                {#if counts === null}
                                    <span class="dark:text-white">-</span>
                                {:else if counts.errors === 0 && counts.warnings === 0}
                                    <Badge color="green">keine Meldungen</Badge>
                                {:else}
                                    {#if counts.errors > 0}
                                        <Badge color="red">{counts.errors} Fehler</Badge>
                                    {/if}
                                    {#if counts.warnings > 0}
                                        <Badge color="yellow">{counts.warnings} Warnungen</Badge>
                                    {/if}
                                {/if}
                            </span>
                        </div>
                    {/if}

                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
                        Letzte Meldung: {formatLastSeen(anlage.lastSeen)}
                        ({formatAge(anlage.ageSeconds)})
                    </p>
                </Card>
            {/each}
        </div>
    {/if}

    <Heading tag="h2" class="text-xl font-semibold mb-3">Tokens</Heading>
    <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Jede Anlage braucht ein eigenes Token. Es wird bei der Einrichtung
        des openHABian im Assistenten angegeben (oder als IBM_STATUS_TOKEN
        in die ibm.conf eingetragen) und erlaubt der Anlage, ihren Status zu
        melden. Löschen widerruft das Token.
    </p>

    <form
        method="POST"
        action="?/createToken"
        use:enhance
        class="flex flex-wrap items-end gap-3 mb-4"
    >
        <div class="w-72">
            <Select
                name="memberId"
                items={memberOptions}
                bind:value={selectedMemberId}
                placeholder="Mitglied auswählen"
            />
        </div>
        <Button type="submit" disabled={!selectedMemberId}>Token erstellen</Button>
    </form>

    {#if form?.message}
        <p class="text-sm text-red-600 mb-4">{form.message}</p>
    {/if}
    {#if form?.created}
        <p class="text-sm text-green-700 dark:text-green-400 mb-4">
            Token erstellt: <code class="font-mono">{form.created}</code>
        </p>
    {/if}

    {#if statuses.length > 0}
        <Table striped hoverable class="mb-8">
            <TableHead>
                <TableHeadCell>Mitglied</TableHeadCell>
                <TableHeadCell>Anlage</TableHeadCell>
                <TableHeadCell>Token</TableHeadCell>
                <TableHeadCell>Erstellt</TableHeadCell>
                <TableHeadCell>Letzte Meldung</TableHeadCell>
                <TableHeadCell></TableHeadCell>
            </TableHead>
            <TableBody>
                {#each statuses as anlage (anlage.id)}
                    <TableBodyRow>
                        <TableBodyCell>{anlage.memberName}</TableBodyCell>
                        <TableBodyCell>{anlage.name || "-"}</TableBodyCell>
                        <TableBodyCell>
                            <div class="flex items-center gap-2">
                                <code class="font-mono text-xs">{anlage.token}</code>
                                <Button
                                    size="xs"
                                    color="light"
                                    onclick={() => copyToken(anlage.token)}
                                >
                                    Kopieren
                                </Button>
                            </div>
                        </TableBodyCell>
                        <TableBodyCell>{formatLastSeen(anlage.createdAt)}</TableBodyCell>
                        <TableBodyCell>{formatLastSeen(anlage.lastSeen)}</TableBodyCell>
                        <TableBodyCell>
                            <form
                                method="POST"
                                action="?/deleteToken"
                                use:enhance
                                onsubmit={(/** @type {SubmitEvent} */ e) => {
                                    if (!confirm(`Token von ${anlage.memberName} wirklich löschen? Die Anlage kann dann nicht mehr melden.`)) {
                                        e.preventDefault();
                                    }
                                }}
                            >
                                <input type="hidden" name="id" value={anlage.id} />
                                <Button size="xs" color="red" type="submit">Löschen</Button>
                            </form>
                        </TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    {/if}
</div>
