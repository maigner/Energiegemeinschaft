<script>
    import maplibregl from "maplibre-gl";
    import "maplibre-gl/dist/maplibre-gl.css";
    import { onMount, onDestroy } from "svelte";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import {
        Alert,
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
    import { baseOptions } from "../energy/overview/chartShared.js";

    let { data } = $props();

    const PERIOD_LABELS = /** @type {Record<number, string>} */ ({
        1: "24 Stunden",
        7: "7 Tage",
        30: "30 Tage",
        90: "90 Tage",
        0: "Alles",
    });

    // Farbe folgt dem Jail, nicht der Reihenfolge: ein Filter faerbt die
    // verbleibende Reihe nicht um. Weitere Jails bekommen die Reservefarben
    // in der (alphabetischen) Reihenfolge aller bekannten Jails.
    const JAIL_COLORS = /** @type {Record<string, string>} */ ({
        sshd: "#1A56DB",
        postgresql: "#D97706",
        "caddy-scan": "#0E9F6E",
    });
    const SPARE_COLORS = ["#0694A2", "#6B7280"];
    const MARK_COLOR = "#C81E1E";

    const jails = $derived(/** @type {any[]} */ (data.jails ?? []));
    const jailColor = $derived.by(() => {
        /** @type {Map<string, string>} */
        const m = new Map();
        let spare = 0;
        for (const j of jails) {
            m.set(j.jail, JAIL_COLORS[j.jail] ?? SPARE_COLORS[spare++ % SPARE_COLORS.length]);
        }
        return m;
    });

    const totals = $derived(/** @type {any} */ (data.totals ?? { bans: 0 }));
    const points = $derived(/** @type {any[]} */ (data.points ?? []));
    const located = $derived(points.reduce((sum, p) => sum + p.count, 0));

    const nf = new Intl.NumberFormat("de-AT");
    const fmt = (/** @type {number} */ n) => nf.format(n ?? 0);
    const share = (/** @type {number} */ n) =>
        totals.bans > 0 ? `${Math.round((100 * n) / totals.bans)}%` : "";

    /** 'YYYY-MM-DD HH:MI' -> 'DD.MM.YYYY HH:MI' */
    const fmtTime = (/** @type {string | null} */ s) =>
        s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}${s.length > 10 ? " " + s.slice(11, 16) : ""}` : "";

    const fmtBantime = (/** @type {number | null} */ s) => {
        if (s == null) return "";
        if (s < 0) return "dauerhaft";
        if (s < 3600) return `${Math.round(s / 60)} min`;
        if (s < 86400) return `${Math.round(s / 3600)} h`;
        return `${Math.round(s / 86400)} Tage`;
    };

    const place = (/** @type {any} */ r) =>
        [r.city, r.country].filter(Boolean).join(", ");

    const href = (/** @type {number} */ days, /** @type {string} */ jail) =>
        `?tage=${days}${jail ? `&jail=${encodeURIComponent(jail)}` : ""}`;

    // --- Verlauf -----------------------------------------------------------
    // Die Zeitabschnitte kommen als Wiener Ortszeit ohne Zone; als UTC
    // gelesen und mit datetimeUTC angezeigt bleiben sie Wiener Zeit, egal wo
    // der Browser steht.
    const ts = (/** @type {string} */ bucket) => Date.parse(`${bucket}:00Z`);
    const hourly = $derived(data.bucket === "hour");

    const bucketLabel = (/** @type {number} */ value) => {
        const d = new Date(value);
        const day = d.toLocaleDateString("de-AT", {
            weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
        });
        return hourly ? `${day}, ${String(d.getUTCHours()).padStart(2, "0")}:00 Uhr` : day;
    };

    const chartSeries = $derived.by(() => {
        const buckets = /** @type {string[]} */ (data.buckets ?? []);
        /** @type {Map<string, Map<string, number>>} */
        const byJail = new Map();
        for (const r of /** @type {any[]} */ (data.series ?? [])) {
            if (!byJail.has(r.jail)) byJail.set(r.jail, new Map());
            byJail.get(r.jail)?.set(r.bucket, r.count);
        }
        return [...byJail.keys()].sort().map((jail) => ({
            name: jail,
            color: jailColor.get(jail) ?? SPARE_COLORS[0],
            // null statt 0: ein Abschnitt ohne Sperre zeichnet sonst einen Strich
            data: /** @type {any} */ (buckets.map((b) => [ts(b), byJail.get(jail)?.get(b) ?? null])),
        }));
    });

    /** @type {import("apexcharts").ApexOptions} */
    const chartOptions = $derived.by(() => {
        const base = baseOptions();
        return {
            ...base,
            chart: { ...base.chart, type: "bar", stacked: true, height: "260px" },
            series: chartSeries,
            colors: chartSeries.map((s) => s.color),
            plotOptions: {
                bar: {
                    columnWidth: "72%",
                    borderRadius: 3,
                    borderRadiusApplication: "end",
                    borderRadiusWhenStacked: "last",
                },
            },
            // 2 px Luft zwischen den Balken und den gestapelten Abschnitten
            stroke: { show: true, width: 2, colors: ["transparent"] },
            fill: { opacity: 1 },
            xaxis: {
                ...base.xaxis,
                labels: { ...base.xaxis?.labels, datetimeUTC: true },
            },
            yaxis: {
                min: 0,
                forceNiceScale: true,
                labels: {
                    style: { colors: "#6b7280" },
                    formatter: (/** @type {number} */ v) => (Number.isInteger(v) ? String(v) : ""),
                },
            },
            tooltip: {
                shared: true,
                intersect: false,
                x: { formatter: bucketLabel },
                y: { formatter: (/** @type {number} */ v) => `${fmt(v)} Sperren` },
            },
        };
    });

    // --- Karte ---------------------------------------------------------------
    /** @type {maplibregl.Map | undefined} */
    let map;
    /** @type {HTMLDivElement} */
    let mapContainer;
    let mapLoaded = $state(false);
    /** @type {maplibregl.Popup | undefined} */
    let hoverPopup;

    const geojson = $derived({
        type: /** @type {const} */ ("FeatureCollection"),
        features: points.map((p) => ({
            type: /** @type {const} */ ("Feature"),
            geometry: { type: /** @type {const} */ ("Point"), coordinates: [p.longitude, p.latitude] },
            properties: { count: p.count, label: place(p) || "Ort unbekannt" },
        })),
    });

    // Sperren je Kreis: ein Ort traegt count, ein Buendel die Summe
    /** @type {any} */
    const N = ["coalesce", ["get", "sum"], ["get", "count"]];

    $effect(() => {
        const g = geojson;
        if (!mapLoaded || !map) return;
        /** @type {maplibregl.GeoJSONSource | undefined} */ (map.getSource("bans"))?.setData(g);
    });

    onMount(() => {
        if (!mapContainer) return;
        // OpenFreeMap wie auf /board/map: EU-gehostet, kein Schluessel, kein Tracking
        map = new maplibregl.Map({
            container: mapContainer,
            style: "https://tiles.openfreemap.org/styles/liberty",
            center: [15, 28],
            zoom: 1.3,
            attributionControl: { compact: true },
            cooperativeGestures: true,
            locale: {
                "CooperativeGesturesHandler.MobileHelpText": "Karte mit zwei Fingern verschieben",
                "CooperativeGesturesHandler.WindowsHelpText": "Karte mit Strg + Scrollen zoomen",
                "CooperativeGesturesHandler.MacHelpText": "Karte mit ⌘ + Scrollen zoomen",
            },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
        const m = map;

        m.on("load", () => {
            m.addSource("bans", {
                type: "geojson",
                data: geojson,
                cluster: true,
                clusterRadius: 36,
                clusterMaxZoom: 9,
                clusterProperties: { sum: ["+", ["get", "count"]] },
            });
            // Flaeche waechst mit der Anzahl (Radius ~ Wurzel)
            m.addLayer({
                id: "bans-circle",
                type: "circle",
                source: "bans",
                paint: {
                    "circle-color": MARK_COLOR,
                    "circle-opacity": 0.6,
                    "circle-radius": ["interpolate", ["linear"], ["sqrt", N], 1, 5, 10, 20, 50, 44],
                    "circle-stroke-width": 2,
                    "circle-stroke-color": "#ffffff",
                },
            });
            // Zahl nur auf Kreisen, die gross genug dafuer sind
            m.addLayer({
                id: "bans-count",
                type: "symbol",
                source: "bans",
                filter: [">=", N, 10],
                layout: {
                    "text-field": ["to-string", N],
                    "text-font": ["Noto Sans Bold"],
                    "text-size": 12,
                    "text-allow-overlap": true,
                },
                paint: { "text-color": "#ffffff" },
            });
            mapLoaded = true;

            hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
            m.on("mousemove", "bans-circle", (e) => {
                const f = e.features?.[0];
                if (!f || !hoverPopup) return;
                m.getCanvas().style.cursor = "pointer";
                const p = f.properties ?? {};
                const el = document.createElement("div");
                el.className = "text-sm text-gray-900";
                const strong = document.createElement("strong");
                const n = Number(p.sum ?? p.count ?? 0);
                strong.textContent = `${fmt(n)} ${n === 1 ? "Sperre" : "Sperren"}`;
                el.appendChild(strong);
                const sub = document.createElement("div");
                sub.textContent = p.cluster
                    ? `an ${fmt(Number(p.point_count))} Orten, Klick zoomt hinein`
                    : String(p.label ?? "");
                el.appendChild(sub);
                hoverPopup
                    .setLngLat(/** @type {any} */ (f.geometry).coordinates)
                    .setDOMContent(el)
                    .addTo(m);
            });
            m.on("mouseleave", "bans-circle", () => {
                m.getCanvas().style.cursor = "";
                hoverPopup?.remove();
            });
            m.on("click", "bans-circle", async (e) => {
                const f = e.features?.[0];
                if (!f) return;
                const center = /** @type {any} */ (f.geometry).coordinates;
                if (f.properties?.cluster) {
                    const source = /** @type {maplibregl.GeoJSONSource} */ (m.getSource("bans"));
                    const zoom = await source.getClusterExpansionZoom(f.properties.cluster_id);
                    m.easeTo({ center, zoom });
                } else {
                    m.easeTo({ center, zoom: Math.max(m.getZoom(), 5) });
                }
            });
        });
    });

    onDestroy(() => {
        hoverPopup?.remove();
        map?.remove();
    });
</script>

<svelte:head>
    <title>ISCHLSTROM - Gesperrte Adressen</title>
</svelte:head>

<div class="p-4 max-w-7xl mx-auto">
    <div class="flex flex-wrap items-center gap-4 mb-2">
        <Heading tag="h1" class="text-2xl font-semibold w-auto">Gesperrte Adressen</Heading>
        {#if data.available && totals.last_import}
            <span class="text-sm text-gray-500 dark:text-gray-400">
                letzte neue Sperre übernommen {fmtTime(totals.last_import)}
            </span>
        {/if}
    </div>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-3xl">
        Woher die Adressen kommen, die fail2ban auf s1 gesperrt hat:
        fehlgeschlagene Anmeldungen an SSH und PostgreSQL und Scanner am
        Webserver (Jail <code>caddy-scan</code>, Abrufe wie
        <code>/.env</code> oder <code>/wp-login.php</code>). Der Standort
        stammt aus einer lokalen Geo-Datenbank auf dem Server.
    </p>

    {#if !data.available}
        <Alert color="yellow">
            Die Tabelle für die Sperren fehlt noch (Migration <code>security 0001</code>).
            Danach <code>scripts/fail2ban-geo/install-on-s1.sh</code> ausführen.
        </Alert>
    {:else}
        <!-- Filter: eine Zeile über allem -->
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
            <div class="flex flex-wrap items-center gap-1">
                <span class="text-xs text-gray-500 dark:text-gray-400 mr-1">Zeitraum</span>
                {#each data.periods as d}
                    <Button
                        size="xs"
                        color={d === data.days ? "primary" : "light"}
                        href={href(d, data.jail)}
                        data-sveltekit-noscroll
                    >
                        {PERIOD_LABELS[d]}
                    </Button>
                {/each}
            </div>
            <div class="flex flex-wrap items-center gap-1">
                <span class="text-xs text-gray-500 dark:text-gray-400 mr-1">Jail</span>
                <Button
                    size="xs"
                    color={data.jail === "" ? "primary" : "light"}
                    href={href(data.days, "")}
                    data-sveltekit-noscroll
                >
                    alle
                </Button>
                {#each jails as j}
                    <Button
                        size="xs"
                        color={data.jail === j.jail ? "primary" : "light"}
                        href={href(data.days, j.jail)}
                        data-sveltekit-noscroll
                    >
                        {j.jail}
                    </Button>
                {/each}
            </div>
        </div>

        <!-- Kennzahlen -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <div class="text-xs text-gray-500 dark:text-gray-400">Sperren</div>
                <div class="text-2xl font-semibold text-gray-900 dark:text-white">{fmt(totals.bans)}</div>
            </div>
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <div class="text-xs text-gray-500 dark:text-gray-400">Länder</div>
                <div class="text-2xl font-semibold text-gray-900 dark:text-white">{fmt(totals.countries)}</div>
            </div>
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <div class="text-xs text-gray-500 dark:text-gray-400">Netze (AS)</div>
                <div class="text-2xl font-semibold text-gray-900 dark:text-white">{fmt(totals.networks)}</div>
            </div>
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <div class="text-xs text-gray-500 dark:text-gray-400">auf der Karte</div>
                <div class="text-2xl font-semibold text-gray-900 dark:text-white">{fmt(located)}</div>
                {#if totals.unlocated > 0}
                    <div class="text-xs text-gray-500 dark:text-gray-400">{fmt(totals.unlocated)} ohne Standort</div>
                {/if}
            </div>
        </div>

        {#if totals.internal > 0}
            <Alert color="yellow" class="mb-4">
                <span class="font-semibold">
                    {fmt(totals.internal)} {totals.internal === 1 ? "Sperre betrifft" : "Sperren betreffen"}
                    eine Adresse aus einem privaten Netz
                </span>
                (Docker, WireGuard-Tunnel, Heimnetz). Das ist kein Angriff von außen, sondern meist
                ein eigener Dienst mit falschen Zugangsdaten. Die Zeilen sind unten markiert; aufheben mit
                <code>sudo fail2ban-client set &lt;jail&gt; unbanip &lt;Adresse&gt;</code> auf s1.
            </Alert>
        {/if}

        {#if totals.bans === 0}
            <Alert color="blue" class="mb-4">
                {#if jails.length === 0}
                    Noch keine Sperren gespeichert. Der Timer <code>fail2ban-geo</code> auf s1 überträgt sie alle
                    10 Minuten (<code>scripts/fail2ban-geo/install-on-s1.sh</code>).
                {:else}
                    Keine Sperren in diesem Zeitraum.
                {/if}
            </Alert>
        {/if}
    {/if}

    <!-- Die Karte bleibt beim Filtern stehen, nur ihre Daten wechseln -->
    <div
        bind:this={mapContainer}
        class="h-[55dvh] md:h-[62dvh] w-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden {data.available ? '' : 'hidden'}"
    ></div>

    {#if data.available}
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-6 max-w-4xl">
            Ein Kreis je Ort, die Fläche wächst mit der Zahl der Sperren; nahe Orte sind gebündelt, ein Klick
            zoomt hinein. Der Standort ist der Sitz des Netzes, oft ein Rechenzentrum oder ein VPN-Ausgang:
            Land und Netz stimmen meist, der Ort nur ungefähr.
        </p>

        {#if totals.bans > 0}
            <Card class="max-w-none p-4 md:p-6 mb-6" size="xl">
                <Heading tag="h2" class="text-lg font-semibold mb-1">
                    Sperren je {hourly ? "Stunde" : "Tag"}
                </Heading>
                <Chart options={chartOptions} />
            </Card>

            <div class="grid gap-6 lg:grid-cols-2 mb-6">
                <Card class="max-w-none p-4 md:p-6" size="xl">
                    <Heading tag="h2" class="text-lg font-semibold mb-3">Häufigste Länder</Heading>
                    <Table>
                        <TableHead>
                            <TableHeadCell>Land</TableHeadCell>
                            <TableHeadCell class="text-right">Sperren</TableHeadCell>
                            <TableHeadCell class="text-right">Anteil</TableHeadCell>
                        </TableHead>
                        <TableBody>
                            {#each data.countries ?? [] as c}
                                <TableBodyRow>
                                    <TableBodyCell class="py-2 whitespace-normal">
                                        {c.country || c.country_code}
                                        <span class="text-gray-400">{c.country_code}</span>
                                    </TableBodyCell>
                                    <TableBodyCell class="py-2 text-right tabular-nums">{fmt(c.count)}</TableBodyCell>
                                    <TableBodyCell class="py-2 text-right tabular-nums">{share(c.count)}</TableBodyCell>
                                </TableBodyRow>
                            {/each}
                        </TableBody>
                    </Table>
                </Card>

                <Card class="max-w-none p-4 md:p-6" size="xl">
                    <Heading tag="h2" class="text-lg font-semibold mb-3">Häufigste Netze</Heading>
                    <Table>
                        <TableHead>
                            <TableHeadCell>Betreiber</TableHeadCell>
                            <TableHeadCell>Länder</TableHeadCell>
                            <TableHeadCell class="text-right">Sperren</TableHeadCell>
                        </TableHead>
                        <TableBody>
                            {#each data.networks ?? [] as n}
                                <TableBodyRow>
                                    <TableBodyCell class="py-2 whitespace-normal">
                                        {n.as_org || "unbekannt"}
                                        <span class="text-gray-400">AS{n.asn}</span>
                                    </TableBodyCell>
                                    <TableBodyCell class="py-2 whitespace-normal">{n.countries ?? ""}</TableBodyCell>
                                    <TableBodyCell class="py-2 text-right tabular-nums">{fmt(n.count)}</TableBodyCell>
                                </TableBodyRow>
                            {/each}
                        </TableBody>
                    </Table>
                </Card>
            </div>

            <Card class="max-w-none p-4 md:p-6 mb-6" size="xl">
                <Heading tag="h2" class="text-lg font-semibold mb-3">Letzte Sperren</Heading>
                <Table>
                    <TableHead>
                        <TableHeadCell>Zeit</TableHeadCell>
                        <TableHeadCell>Jail</TableHeadCell>
                        <TableHeadCell>Adresse</TableHeadCell>
                        <TableHeadCell>Ort</TableHeadCell>
                        <TableHeadCell>Netz</TableHeadCell>
                        <TableHeadCell>Dauer</TableHeadCell>
                    </TableHead>
                    <TableBody>
                        {#each data.recent ?? [] as r}
                            <TableBodyRow>
                                <TableBodyCell class="py-2 tabular-nums">{fmtTime(r.banned_at)}</TableBodyCell>
                                <TableBodyCell class="py-2">
                                    <span class="inline-flex items-center gap-1.5">
                                        <span
                                            class="inline-block h-2.5 w-2.5 rounded-sm"
                                            style="background: {jailColor.get(r.jail) ?? SPARE_COLORS[0]}"
                                        ></span>
                                        {r.jail}
                                    </span>
                                </TableBodyCell>
                                <TableBodyCell class="py-2 font-mono text-xs">
                                    {#if r.ip}
                                        {r.ip}
                                        {#if r.internal}
                                            <Badge color="yellow" class="ml-1 font-sans">privates Netz</Badge>
                                        {/if}
                                    {:else}
                                        <span class="font-sans text-gray-400">gelöscht (älter als 90 Tage)</span>
                                    {/if}
                                </TableBodyCell>
                                <TableBodyCell class="py-2 whitespace-normal">{place(r) || "ohne Standort"}</TableBodyCell>
                                <TableBodyCell class="py-2 whitespace-normal">
                                    {#if r.asn}
                                        {r.as_org || "unbekannt"} <span class="text-gray-400">AS{r.asn}</span>
                                    {/if}
                                </TableBodyCell>
                                <TableBodyCell class="py-2">{fmtBantime(r.bantime_seconds)}</TableBodyCell>
                            </TableBodyRow>
                        {/each}
                    </TableBody>
                </Table>
                {#if totals.bans > (data.recent?.length ?? 0)}
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Die letzten {data.recent?.length} von {fmt(totals.bans)} Sperren im Zeitraum.
                    </p>
                {/if}
            </Card>
        {/if}

        <p class="text-xs text-gray-500 dark:text-gray-400 max-w-4xl">
            Die Adressen werden nach 90 Tagen gelöscht, Land, Ort und Netz bleiben für die Auswertung erhalten.
            Sperren des Mailservers (mailcow) sind nicht enthalten, er sperrt mit einem eigenen Dienst.
            IP-Geodaten: <a class="underline" href="https://db-ip.com" rel="noreferrer" target="_blank">IP Geolocation by DB-IP</a>
            (CC BY 4.0).
        </p>
    {/if}
</div>
