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
    import { inverterLabel } from "$lib/inverters";

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

    /** @param {string} token */
    function copyToken(token) {
        navigator.clipboard?.writeText(token);
    }

    /**
     * Aktuelle Netzeinspeisung aus der Batterie in W, aus der letzten
     * Meldung berechnet - dieselbe Rechnung wie auf dem Pi
     * (ibm_netzeinspeisung.js) und in den Verlaufscharts der Detailseite:
     * Die Batterie liefert (+) und das Netz nimmt auf (Netzleistung
     * negativ); der kleinere der beiden Werte fließt tatsächlich von der
     * Batterie ins Netz. null, wenn die Anlage keine Leistungswerte meldet.
     * @param {any} d
     */
    function batteryToGridW(d) {
        if (
            typeof d.battery_power_w !== "number" ||
            typeof d.grid_power_w !== "number"
        ) {
            return null;
        }
        return Math.round(
            Math.min(
                Math.max(d.battery_power_w, 0),
                Math.max(-d.grid_power_w, 0),
            ),
        );
    }

    /**
     * Wirksames Ladesperre-Fenster heute: meldet die Anlage ein lokal
     * berechnetes Ende (lokale Ladesperre), gilt dieses statt des
     * Server-Endes aus der Tagesprognose.
     * @param {any} d
     */
    function sperreText(d) {
        const t = (/** @type {unknown} */ v) =>
            typeof v === "string" && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5) : null;
        if (d.ladesperre_aktiv === "OFF") return "aus";
        const start = t(d.ladesperre_start);
        const ende = t(d.ladesperre_lokal_ende) ?? t(d.ladesperre_ende);
        return start && ende ? `${start}-${ende}` : "keine";
    }

    /**
     * Uptime aus dem gemeldeten Boot-Zeitpunkt (Lokalzeit der Anlage,
     * "YYYY-MM-DD HH:MM:SS"); null, wenn keiner vorliegt oder unlesbar.
     * @param {any} data
     */
    function uptimeText(data) {
        const booted = data?.system?.booted_at;
        if (typeof booted !== "string") return null;
        const t = new Date(booted.replace(" ", "T")).getTime();
        if (!Number.isFinite(t)) return null;
        const s = Math.max(0, (Date.now() - t) / 1000);
        if (s < 90) return "1 Minute";
        if (s < 3600) return `${Math.round(s / 60)} Minuten`;
        if (s < 5400) return "1 Stunde";
        if (s < 172800) return `${Math.round(s / 3600)} Stunden`;
        return `${Math.round(s / 86400)} Tage`;
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

    /**
     * Sammelt die Auffälligkeiten einer Anlage für die Hinweis-Badges der
     * Karte. Alles Unauffällige bleibt weg -- eine leere Liste heißt:
     * alles in Ordnung.
     * @param {any} d
     * @returns {{ text: string, color: "red" | "yellow" | "gray" }[]}
     */
    function issuesOf(d) {
        /** @type {{ text: string, color: "red" | "yellow" | "gray" }[]} */
        const issues = [];
        if (d.inverter_status && d.inverter_status !== "ONLINE") {
            issues.push({ text: `Wechselrichter ${d.inverter_status}`, color: "red" });
        }
        if (d.hauptschalter === "OFF") {
            issues.push({ text: "Batteriemanagement aus", color: "yellow" });
        } else {
            const pause = Number(d.pause_tage);
            if (pause > 0) {
                issues.push({ text: `pausiert (noch ${pause} Tag${pause === 1 ? "" : "e"})`, color: "yellow" });
            }
            if (d.ladesperre_aktiv === "OFF") issues.push({ text: "Ladesperre aus", color: "gray" });
            if (d.entladung_aktiv === "OFF") issues.push({ text: "Entladung aus", color: "gray" });
        }
        const counts = logCounts(d);
        if (counts?.errors) issues.push({ text: `${counts.errors} Fehler im Log`, color: "red" });
        if (counts?.warnings) issues.push({ text: `${counts.warnings} Warnungen im Log`, color: "yellow" });
        if (d.versions?.ibm && newestIbm && compareVersions(d.versions.ibm, newestIbm) < 0) {
            issues.push({ text: `IBM-Paket ${d.versions.ibm} veraltet`, color: "yellow" });
        }
        if (d.apt_updates?.pending > 0) {
            issues.push({ text: `${d.apt_updates.pending} apt-Updates`, color: "yellow" });
        }
        if (d.system?.reboot_required) {
            issues.push({ text: "Neustart erforderlich", color: "yellow" });
        }
        const disk = d.system?.disk_used_pct;
        if (typeof disk === "number" && disk >= 80) {
            issues.push({ text: `SD-Karte ${Math.round(disk)}% belegt`, color: disk >= 90 ? "red" : "yellow" });
        }
        return issues;
    }
</script>

{#snippet stat(/** @type {string} */ value, /** @type {string} */ label)}
    <div>
        <p class="text-base font-semibold dark:text-white">{value}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
{/snippet}

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
                {@const issues = issuesOf(d)}
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
                        {#if inverterLabel(d.inverter_type)}
                            · {inverterLabel(d.inverter_type)}
                        {/if}
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

                        <div class="grid grid-cols-3 gap-2 text-center mb-3">
                            {@render stat(
                                num(d.batterie_kapazitaet) !== null ? `${num(d.batterie_kapazitaet)} kWh` : "-",
                                "Kapazität",
                            )}
                            {@render stat(
                                num(d.ladeleistung_kw) !== null ? `${num(d.ladeleistung_kw)} kW` : "-",
                                "Ladeleistung",
                            )}
                            {@render stat(
                                num(d.wolkenvorschau, 0) !== null ? `${num(d.wolkenvorschau, 0)}%` : "-",
                                "Wolkenvorschau",
                            )}
                            {@render stat(sperreText(d), "Sperre heute")}
                            {@render stat(
                                batteryToGridW(d) !== null ? `${batteryToGridW(d)} W` : "-",
                                "Einspeisung aus Batterie",
                            )}
                            {@render stat(uptimeText(d) ?? "-", "Uptime")}
                        </div>

                        <div class="flex flex-wrap gap-1.5">
                            {#if issues.length === 0}
                                <Badge color="green">alles in Ordnung</Badge>
                            {:else}
                                {#each issues as issue}
                                    <Badge color={issue.color}>{issue.text}</Badge>
                                {/each}
                            {/if}
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
