<script>
    import { Card, Badge, Indicator, Heading } from "flowbite-svelte";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { compareVersions } from "$lib/versions";

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
    <p
        class="text-sm text-gray-500 dark:text-gray-400 {anlage.data?.versions ||
        anlage.data?.apt_updates
            ? 'mb-1'
            : 'mb-6'}"
    >
        Mitglied: {anlage.memberName}. Letzte Meldung: {formatLastSeen(
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

    {#if anlage.data?.versions || anlage.data?.apt_updates}
        {@const v = anlage.data.versions ?? {}}
        {@const apt = anlage.data.apt_updates}
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
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

    <!-- Solange die Anlage noch nie gemeldet hat, gibt es auch keine
         Logmeldungen zu zeigen - die Karte wäre nur irreführend. -->
    {#if anlage.lastSeen}
    <Card class="max-w-none p-4 md:p-6 mb-6">
        <Heading tag="h2" class="text-lg font-semibold mb-2">
            Fehler und Warnungen
        </Heading>
        {#if logEntries === null}
            <p class="text-gray-600 dark:text-gray-300">
                Diese Anlage überträgt noch keine Logmeldungen. Dafür muss das
                IBM-Paket auf dem openHABian aktualisiert werden.
            </p>
        {:else if logEntries.length === 0}
            <p class="text-green-700 dark:text-green-400">
                Keine Fehler oder Warnungen im openHAB-Log der letzten 24
                Stunden.
            </p>
        {:else}
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                openHAB-Log der letzten 24 Stunden, Stand der letzten Meldung
                (neueste zuerst, höchstens 20 Einträge).
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
    {/if}
</div>
