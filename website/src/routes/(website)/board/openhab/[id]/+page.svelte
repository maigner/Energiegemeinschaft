<script>
    import { Card, Badge, Indicator, Heading } from "flowbite-svelte";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { compareVersions } from "$lib/versions";
    import { inverterLabel } from "$lib/inverters";

    let { data } = $props();

    let anlage = $derived(data.anlage);
    let history = $derived(data.history ?? []);

    // Von der Anlage mitgelieferte WARN/ERROR-Zeilen aus dem openHAB-Log
    // (letzte 24 Stunden, Stand der letzten Meldung), neueste zuerst.
    // undefined/null: die Anlage überträgt (noch) keine Logmeldungen.
    /** @type {{ time: string, level: string, logger: string, message: string }[] | null} */
    let logEntries = $derived(
        Array.isArray(anlage.data?.log_entries)
            ? [...anlage.data.log_entries].reverse()
            : null,
    );

    /**
     * Hinkt der gemeldete Stand dem neuesten Stand der Flotte hinterher?
     * @param {"ibm" | "openhab" | "java"} key
     * @param {string | null | undefined} value
     */
    function isOutdated(key, value) {
        const newest = data.fleetNewest?.[key];
        return (
            typeof value === "string" &&
            typeof newest === "string" &&
            compareVersions(value, newest) < 0
        );
    }

    // Vom Pi gemeldeter Systemzustand (Temperatur, Stromversorgung, SD-Karte,
    // Speicher, Reboot-Bedarf). undefined/null: die Anlage überträgt (noch)
    // keine Systemwerte.
    let system = $derived(anlage.data?.system ?? null);

    // Zustand des Batteriemanagements aus der letzten Meldung, aufbereitet
    // für die Karte. Das wirksame Sperr-Ende ist das lokal berechnete, wenn
    // die Anlage eines meldet (lokale Ladesperre), sonst das Server-Ende
    // aus der Tagesprognose.
    let bm = $derived.by(() => {
        const d = anlage.data ?? {};
        const time = (/** @type {unknown} */ v) =>
            typeof v === "string" && /^\d{1,2}:\d{2}/.test(v)
                ? v.slice(0, 5)
                : null;
        const num = (/** @type {unknown} */ v, digits = 1) =>
            typeof v === "number" && Number.isFinite(v)
                ? v.toFixed(digits)
                : null;
        const start = time(d.ladesperre_start);
        const lokalEnde = time(d.ladesperre_lokal_ende);
        const ende = lokalEnde ?? time(d.ladesperre_ende);
        const pauseTage = Number(d.pause_tage) || 0;
        const minW = num(d.min_entladeleistung_w, 0);
        const maxW = num(d.max_entladeleistung_w, 0);
        return {
            hauptschalter: typeof d.hauptschalter === "string" ? d.hauptschalter : null,
            pauseTage,
            sperreAus: d.ladesperre_aktiv === "OFF",
            sperre:
                d.ladesperre_aktiv === "OFF"
                    ? "deaktiviert"
                    : start && ende
                      ? `${start} bis ${ende}${
                            d.ladesperre_individuell === "ON"
                                ? " (individuell)"
                                : lokalEnde
                                  ? " (lokal berechnet)"
                                  : ""
                        }`
                      : "heute keine",
            entladungAus: d.entladung_aktiv === "OFF",
            entladung:
                d.entladung_aktiv === "OFF"
                    ? "deaktiviert"
                    : minW && maxW
                      ? `${minW} bis ${maxW} W`
                      : "aktiv",
            ladeleistung: num(d.ladeleistung_kw),
            kapazitaet: num(d.batterie_kapazitaet),
            minSoc: num(d.min_battery_charge, 0),
            wolken: num(d.wolkenvorschau, 0),
            schwelle: num(d.wolken_schwelle, 0),
            hauslast: num(d.hauslast_w, 0),
            // kommt als String-Item ('-' = kein Budget)
            nachtbudget:
                typeof d.nachtbudget_kwh === "string" &&
                Number.isFinite(Number(d.nachtbudget_kwh))
                    ? Number(d.nachtbudget_kwh).toFixed(1)
                    : null,
        };
    });

    const AMBER = "text-amber-600 dark:text-amber-400";
    const RED = "text-red-600 dark:text-red-400";
    const GREEN = "text-green-700 dark:text-green-400";

    /**
     * Warnungen aus dem throttled-Register des Pi (vcgencmd get_throttled):
     * niedrige Bits = Zustand jetzt, Bits 16–19 = seit dem Boot aufgetreten.
     * @param {unknown} hex z. B. "0x50005"
     * @returns {{ text: string, now: boolean }[] | null}
     */
    function throttleIssues(hex) {
        if (typeof hex !== "string") return null;
        const bits = Number.parseInt(hex, 16);
        if (Number.isNaN(bits)) return null;
        /** @type {{ text: string, now: boolean }[]} */
        const issues = [];
        if (bits & 0x1) issues.push({ text: "Unterspannung!", now: true });
        else if (bits & 0x10000)
            issues.push({ text: "Unterspannung seit Boot", now: false });
        if (bits & 0x4) issues.push({ text: "CPU gedrosselt", now: true });
        else if (bits & 0x40000)
            issues.push({ text: "CPU-Drosselung seit Boot", now: false });
        if (bits & 0x8)
            issues.push({ text: "Temperaturlimit erreicht", now: true });
        else if (bits & 0x80000)
            issues.push({ text: "Temperaturlimit seit Boot", now: false });
        return issues;
    }

    /** Log-Zeitstempel "2026-08-12 14:05:03" → "12.08. 14:05" */
    /** @param {string} time */
    function formatLogTime(time) {
        if (typeof time !== "string" || time.length < 16) return time;
        return `${time.slice(8, 10)}.${time.slice(5, 7)}. ${time.slice(11, 16)}`;
    }

    const ONLINE_SECONDS = 15 * 60;
    const WARN_SECONDS = 60 * 60;

    /**
     * @returns {"online" | "verspätet" | "offline" | "wartet"}
     */
    function statusOf(/** @type {{ ageSeconds: number | null }} */ a) {
        if (a.ageSeconds === null) return "wartet";
        if (a.ageSeconds < ONLINE_SECONDS) return "online";
        if (a.ageSeconds < WARN_SECONDS) return "verspätet";
        return "offline";
    }

    /** @type {Record<"online" | "verspätet" | "offline" | "wartet", "green" | "yellow" | "red" | "gray">} */
    const statusColor = {
        online: "green",
        "verspätet": "yellow",
        offline: "red",
        wartet: "gray",
    };

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

    /**
     * @param {{ time: string }[]} rows
     * @param {(row: any) => number | null} pick
     * @returns {[number, number | null][]}
     */
    function series(rows, pick) {
        return rows.map((row) => [
            new Date(row.time).getTime(),
            pick(row) === null ? null : Math.round((pick(row) ?? 0) * 10) / 10,
        ]);
    }

    /** @type {import('apexcharts').ApexOptions} */
    const baseChart = {
        chart: {
            height: "360px",
            type: "area",
            fontFamily: "Inter, sans-serif",
            toolbar: { show: false },
            zoom: { enabled: false },
            animations: { enabled: false },
        },
        dataLabels: { enabled: false },
        stroke: { width: 2, curve: "straight" },
        markers: { size: 0 },
        grid: { strokeDashArray: 4 },
        tooltip: {
            enabled: true,
            x: { format: "dd.MM. HH:mm" },
        },
        xaxis: {
            type: "datetime",
            labels: {
                datetimeUTC: false,
                datetimeFormatter: {
                    day: "dd.MM.",
                    hour: "dd.MM. HH:mm",
                },
            },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        legend: { show: true },
    };

    /** @type {import('apexcharts').ApexOptions} */
    let socOptions = $derived({
        ...baseChart,
        fill: {
            type: "gradient",
            gradient: { opacityFrom: 0.45, opacityTo: 0 },
        },
        series: [
            {
                name: "Ladestand",
                data: series(history, (r) => r.soc),
                color: "#16A34A",
            },
        ],
        yaxis: {
            min: 0,
            max: 100,
            labels: {
                formatter: (/** @type {number} */ v) => `${Math.round(v)}%`,
            },
        },
    });

    /** @type {import('apexcharts').ApexOptions} */
    let powerOptions = $derived({
        ...baseChart,
        fill: {
            type: "gradient",
            gradient: { opacityFrom: 0.35, opacityTo: 0 },
        },
        series: [
            {
                name: "Einspeisung aus der Batterie",
                data: series(history, (r) => r.batteryToGridW),
                color: "#1C64F2",
            },
            {
                name: "Batterieleistung (Entladen positiv)",
                data: series(history, (r) => r.batteryPowerW),
                color: "#F59E0B",
            },
        ],
        yaxis: {
            labels: {
                formatter: (/** @type {number} */ v) => `${Math.round(v)} W`,
            },
        },
    });

    let hasPowerData = $derived(
        history.some(
            (/** @type {{ batteryPowerW: number | null }} */ r) =>
                r.batteryPowerW !== null,
        ),
    );

    // Systemwerte im Verlauf: Temperatur auf der linken Achse (°C), die
    // drei Belegungsgrade teilen sich die rechte Prozent-Achse (die yaxis-
    // Einträge 3 und 4 hängen sich per seriesName an die SD-Karten-Achse).
    /** @type {import('apexcharts').ApexOptions} */
    let systemOptions = $derived({
        ...baseChart,
        chart: { ...baseChart.chart, type: "line" },
        series: [
            {
                name: "CPU-Temperatur",
                data: series(history, (r) => r.cpuTempC),
                color: "#DC2626",
            },
            {
                name: "SD-Karte belegt",
                data: series(history, (r) => r.diskUsedPct),
                color: "#6B7280",
            },
            {
                name: "Arbeitsspeicher belegt",
                data: series(history, (r) => r.memUsedPct),
                color: "#7C3AED",
            },
            {
                name: "Swap belegt",
                data: series(history, (r) => r.swapUsedPct),
                color: "#0891B2",
            },
        ],
        yaxis: [
            {
                seriesName: "CPU-Temperatur",
                min: 0,
                labels: {
                    formatter: (/** @type {number} */ v) =>
                        `${Math.round(v)} °C`,
                },
            },
            {
                seriesName: "SD-Karte belegt",
                opposite: true,
                min: 0,
                max: 100,
                labels: {
                    formatter: (/** @type {number} */ v) =>
                        `${Math.round(v)}%`,
                },
            },
            { seriesName: "SD-Karte belegt", show: false },
            { seriesName: "SD-Karte belegt", show: false },
        ],
    });

    let hasSystemHistory = $derived(
        history.some(
            (
                /** @type {{ cpuTempC: number | null, diskUsedPct: number | null, memUsedPct: number | null }} */ r,
            ) =>
                r.cpuTempC !== null ||
                r.diskUsedPct !== null ||
                r.memUsedPct !== null,
        ),
    );
</script>

<div class="p-4 max-w-5xl mx-auto">
    <a
        href="/board/openhab"
        class="text-sm text-primary-700 hover:underline dark:text-primary-400"
    >
        Zurück zur Übersicht
    </a>

    <div class="flex flex-wrap items-center gap-3 mt-2 mb-1">
        <Indicator color={statusColor[statusOf(anlage)]} />
        <Heading tag="h1" class="text-2xl font-semibold w-auto">
            {anlage.name || `Anlage von ${anlage.memberName}`}
        </Heading>
        <Badge color={statusColor[statusOf(anlage)]}>{statusOf(anlage)}</Badge>
    </div>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Mitglied: {anlage.memberName}.
        {#if inverterLabel(anlage.data?.inverter_type)}
            Wechselrichter: {inverterLabel(anlage.data?.inverter_type)}.
        {/if}
        Letzte Meldung: {formatLastSeen(
            anlage.lastSeen,
        )}. Diagramme zeigen die letzten {data.historyDays} Tage, gemittelt auf
        15 Minuten.
    </p>
    {#snippet versionPart(
        /** @type {string} */ label,
        /** @type {"ibm" | "openhab" | "java"} */ key,
        /** @type {string | null | undefined} */ value,
    )}
        {#if isOutdated(key, value)}
            <span class="text-amber-600 dark:text-amber-400 font-medium">
                {label}
                {value} (veraltet, neueste: {data.fleetNewest?.[key]})
            </span>
        {:else}
            <span>{label} {value ?? "unbekannt"}</span>
        {/if}
    {/snippet}

    {#snippet systemStat(
        /** @type {string} */ label,
        /** @type {string} */ value,
        /** @type {string} */ cls,
    )}
        <div>
            <dt class="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd class="font-medium {cls || 'text-gray-900 dark:text-gray-100'}">
                {value}
            </dd>
        </div>
    {/snippet}

    {#if history.length === 0}
        <Card class="max-w-xl">
            <p class="text-gray-600 dark:text-gray-300">
                Für diese Anlage liegt noch kein Verlauf vor. Die Daten sammeln
                sich mit jeder Statusmeldung (alle 5 Minuten) an, sobald die
                Anlage meldet.
            </p>
        </Card>
    {:else}
        <Card class="max-w-none p-4 md:p-6 mb-6">
            <Heading tag="h2" class="text-lg font-semibold mb-2">
                Batterie-Ladestand
            </Heading>
            <Chart options={socOptions} />
        </Card>

        <Card class="max-w-none p-4 md:p-6">
            <Heading tag="h2" class="text-lg font-semibold mb-2">
                Leistung Batterie und Netz
            </Heading>
            {#if hasPowerData}
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Einspeisung aus der Batterie ist der Anteil der
                    Batterie-Entladung, der tatsächlich ins Netz fließt (der
                    Rest deckt den Haushalt).
                </p>
                <Chart options={powerOptions} />
            {:else}
                <p class="text-gray-600 dark:text-gray-300">
                    Diese Anlage meldet keine Leistungswerte. Dafür müssen in
                    der Main UI die Channels für Batterie- und Netzleistung mit
                    Items verknüpft sein (bei Fronius:
                    Fronius_Symo_Inverter_Battery_Power und
                    Fronius_Symo_Inverter_Grid_Power).
                </p>
            {/if}
        </Card>

        {#if hasSystemHistory}
            <Card class="max-w-none p-4 md:p-6 mt-6">
                <Heading tag="h2" class="text-lg font-semibold mb-2">
                    Systemwerte
                </Heading>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    CPU-Temperatur (linke Achse) sowie Belegung von SD-Karte,
                    Arbeitsspeicher und Swap (rechte Achse, Prozent).
                </p>
                <Chart options={systemOptions} />
            </Card>
        {/if}
    {/if}

    {#if anlage.data?.versions || anlage.data?.apt_updates}
        {@const v = anlage.data.versions ?? {}}
        {@const apt = anlage.data.apt_updates}
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-6">
            {@render versionPart("IBM-Paket", "ibm", v.ibm)} ·
            {@render versionPart("openHAB", "openhab", v.openhab)} ·
            {@render versionPart("Java", "java", v.java)} ·
            {v.os ?? "OS unbekannt"}
            {#if apt}
                ·
                {#if apt.pending > 0}
                    <span class="text-amber-600 dark:text-amber-400 font-medium">
                        {apt.pending} apt-Update{apt.pending === 1 ? "" : "s"} ausstehend
                    </span>
                {:else}
                    <span>apt aktuell</span>
                {/if}
                {#if apt.lists_updated}
                    (Paketlisten vom {apt.lists_updated})
                {/if}
            {/if}
        </p>
    {/if}

    <!-- Zustand des Batteriemanagements aus der letzten Meldung; erst, wenn
         die Anlage überhaupt schon gemeldet hat. -->
    {#if anlage.lastSeen}
        <Card class="max-w-none p-4 md:p-6 mt-6">
            <Heading tag="h2" class="text-lg font-semibold mb-2">
                Batteriemanagement
            </Heading>
            <dl class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
                {@render systemStat(
                    "Hauptschalter",
                    bm.hauptschalter === "ON"
                        ? "EIN"
                        : bm.hauptschalter === "OFF"
                          ? "AUS"
                          : "unbekannt",
                    bm.hauptschalter === "ON"
                        ? GREEN
                        : bm.hauptschalter === "OFF"
                          ? RED
                          : "",
                )}
                {@render systemStat(
                    "Pause",
                    bm.pauseTage > 0
                        ? `noch ${bm.pauseTage} Tag${bm.pauseTage === 1 ? "" : "e"}`
                        : "keine",
                    bm.pauseTage > 0 ? AMBER : "",
                )}
                {@render systemStat(
                    "Ladesperre heute",
                    bm.sperre,
                    bm.sperreAus ? AMBER : "",
                )}
                {@render systemStat(
                    "Entladung nachts",
                    bm.entladung,
                    bm.entladungAus ? AMBER : "",
                )}
                {@render systemStat(
                    "Gelernte Ladeleistung",
                    bm.ladeleistung !== null
                        ? `${bm.ladeleistung} kW`
                        : "noch keine Schätzung",
                    "",
                )}
                {@render systemStat(
                    "Geschätzte Kapazität",
                    bm.kapazitaet !== null
                        ? `${bm.kapazitaet} kWh`
                        : "noch keine Schätzung",
                    "",
                )}
                {@render systemStat(
                    "Wolkenvorschau",
                    bm.wolken !== null
                        ? `${bm.wolken}%${bm.schwelle !== null ? ` (Sperre unter ${bm.schwelle}%)` : ""}`
                        : "unbekannt",
                    "",
                )}
                {@render systemStat(
                    "Mindest-Ladestand",
                    bm.minSoc !== null ? `${bm.minSoc}%` : "unbekannt",
                    "",
                )}
                {@render systemStat(
                    "Gelernte Hauslast",
                    bm.hauslast !== null
                        ? `${bm.hauslast} W`
                        : "noch keine Schätzung",
                    "",
                )}
                {@render systemStat(
                    "Nacht-Entladebudget",
                    bm.nachtbudget !== null ? `${bm.nachtbudget} kWh` : "-",
                    bm.nachtbudget === "0.0" ? AMBER : "",
                )}
            </dl>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
                "Individuell" heißt: Der Server hat das Sperr-Ende für diese
                Anlage aus dem Erzeugungsprofil des Tages, Batteriegröße und
                gelernter Ladeleistung berechnet. "Lokal berechnet" ist der
                Rückfall der Anlage nach derselben Idee, aber ohne
                Tagesprofil. Ohne beide Angaben gilt das Community-Ende aus
                der Tagesprognose.
            </p>
        </Card>
    {/if}

    <!-- Systemzustand des Pi; wie bei den Logmeldungen erst, wenn die
         Anlage überhaupt schon gemeldet hat. -->
    {#if anlage.lastSeen}
        <Card class="max-w-none p-4 md:p-6 mt-6">
            <Heading tag="h2" class="text-lg font-semibold mb-2">System</Heading>
            {#if !system}
                <p class="text-gray-600 dark:text-gray-300">
                    Diese Anlage überträgt noch keine Systemwerte. Dafür muss
                    das IBM-Paket auf dem openHABian aktualisiert werden.
                </p>
            {:else}
                {@const issues = throttleIssues(system.throttled)}
                {#if system.reboot_required}
                    <p class="flex flex-wrap items-center gap-2 mb-3">
                        <Badge color="yellow">Neustart erforderlich</Badge>
                        <span class="text-sm text-gray-500 dark:text-gray-400">
                            Ein eingespieltes Update (z. B. Kernel) wird erst
                            mit einem Reboot wirksam.
                        </span>
                    </p>
                {/if}
                <dl
                    class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm"
                >
                    {@render systemStat(
                        "CPU-Temperatur",
                        typeof system.cpu_temp_c === "number"
                            ? `${system.cpu_temp_c.toLocaleString("de-AT")} °C`
                            : "unbekannt",
                        system.cpu_temp_c >= 80
                            ? RED
                            : system.cpu_temp_c >= 70
                              ? AMBER
                              : "",
                    )}
                    {@render systemStat(
                        "Stromversorgung",
                        issues === null
                            ? "unbekannt"
                            : issues.length === 0
                              ? "in Ordnung"
                              : issues.map((i) => i.text).join(", "),
                        issues === null
                            ? ""
                            : issues.length === 0
                              ? GREEN
                              : issues.some((i) => i.now)
                                ? RED
                                : AMBER,
                    )}
                    {@render systemStat(
                        "SD-Karte",
                        typeof system.disk_used_pct === "number"
                            ? `${system.disk_used_pct}% belegt`
                            : "unbekannt",
                        system.disk_used_pct >= 90
                            ? RED
                            : system.disk_used_pct >= 80
                              ? AMBER
                              : "",
                    )}
                    {@render systemStat(
                        "Arbeitsspeicher",
                        system.mem_total_mb
                            ? `${system.mem_used_mb} / ${system.mem_total_mb} MB`
                            : "unbekannt",
                        system.mem_total_mb > 0 &&
                            system.mem_used_mb / system.mem_total_mb >= 0.9
                            ? AMBER
                            : "",
                    )}
                    {@render systemStat(
                        "Swap",
                        system.swap_total_mb === 0
                            ? "kein Swap"
                            : system.swap_total_mb
                              ? `${system.swap_used_mb} / ${system.swap_total_mb} MB`
                              : "unbekannt",
                        system.swap_total_mb > 0 &&
                            system.swap_used_mb / system.swap_total_mb >= 0.5
                            ? AMBER
                            : "",
                    )}
                    {@render systemStat(
                        "Läuft seit",
                        system.booted_at
                            ? formatLogTime(system.booted_at)
                            : "unbekannt",
                        "",
                    )}
                    {@render systemStat(
                        "Sicherheitsupdates",
                        system.security_upgrades_last
                            ? `zuletzt ${formatLogTime(system.security_upgrades_last)}`
                            : "kein Lauf bekannt",
                        "",
                    )}
                </dl>
            {/if}
        </Card>
    {/if}

    <!-- Solange die Anlage noch nie gemeldet hat, gibt es auch keine
         Logmeldungen zu zeigen - die Karte wäre nur irreführend. -->
    {#if anlage.lastSeen}
        <Card class="max-w-none p-4 md:p-6 mt-6">
            <Heading tag="h2" class="text-lg font-semibold mb-2">
                Fehler und Warnungen
            </Heading>
            {#if logEntries === null}
                <p class="text-gray-600 dark:text-gray-300">
                    Diese Anlage überträgt noch keine Logmeldungen. Dafür muss
                    das IBM-Paket auf dem openHABian aktualisiert werden.
                </p>
            {:else if logEntries.length === 0}
                <p class="text-green-700 dark:text-green-400">
                    Keine Fehler oder Warnungen im openHAB-Log der letzten 24
                    Stunden.
                </p>
            {:else}
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    openHAB-Log der letzten 24 Stunden, Stand der letzten
                    Meldung (neueste zuerst, höchstens 20 Einträge).
                </p>
                <ul class="divide-y divide-gray-200 dark:divide-gray-700">
                    {#each logEntries as entry}
                        <li class="py-2">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                <Badge
                                    color={entry.level === "ERROR"
                                        ? "red"
                                        : "yellow"}
                                >
                                    {entry.level}
                                </Badge>
                                <span
                                    class="text-sm text-gray-600 dark:text-gray-300"
                                >
                                    {formatLogTime(entry.time)}
                                </span>
                                <span
                                    class="text-xs font-mono text-gray-400 dark:text-gray-500 break-all"
                                >
                                    {entry.logger}
                                </span>
                            </div>
                            <p
                                class="text-sm font-mono break-all text-gray-800 dark:text-gray-200"
                            >
                                {entry.message}
                            </p>
                        </li>
                    {/each}
                </ul>
            {/if}
        </Card>
    {/if}
</div>
