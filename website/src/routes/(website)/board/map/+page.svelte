<script>
    import maplibregl from "maplibre-gl";
    import "maplibre-gl/dist/maplibre-gl.css";
    import { onMount, onDestroy } from "svelte";
    import {
        CURRENT,
        CURRENT_YEAR,
        priceAdvantageCt as priceAdvantageDefaultCt,
        fmtCt,
    } from "$lib/tariffs";
    import {
        Heading,
        Select,
        Label,
        Button,
        Input,
        Badge,
        Alert,
        Modal,
        Table,
        TableHead,
        TableHeadCell,
        TableBody,
        TableBodyRow,
        TableBodyCell,
    } from "flowbite-svelte";

    let { data } = $props();

    /** @type {maplibregl.Map | undefined} */
    let map;
    /** @type {HTMLDivElement} */
    let mapContainer;

    // Kennung der aktuell hervorgehobenen Trafostation ("" = alle).
    let selectedStation = $state("");

    /** @type {{ marker: maplibregl.Marker, station: string }[]} */
    let markers = [];

    // Farbpalette fuer die Stationen; bei 40+ Stationen wiederholen sich die
    // Farben, die eindeutige Zuordnung passiert ueber die Hervorhebung.
    const palette = [
        "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4",
        "#f032e6", "#bfef45", "#fabed4", "#469990", "#9a6324", "#800000",
        "#808000", "#000075", "#dcbeff", "#aaffc3",
    ];
    const unassignedColor = "#9ca3af";

    /**
     * @typedef {{ id: number, identifier: string, name: string, count: number, located: number }} Station
     */

    // Stationen aus den Mitgliedern ableiten, die mit den meisten Mitgliedern
    // zuerst; bei gleicher Anzahl nach Kennung.
    const stations = $derived.by(() => {
        /** @type {Map<string, Station>} */
        const byId = new Map();
        for (const m of data.memberLocations) {
            if (!m.station_identifier) continue;
            const entry = byId.get(m.station_identifier) ?? {
                id: Number(m.station_id),
                identifier: m.station_identifier,
                name: m.station_name,
                count: 0,
                located: 0,
            };
            entry.count++;
            if (m.latitude != null && m.longitude != null) entry.located++;
            byId.set(m.station_identifier, entry);
        }
        return [...byId.values()].sort(
            (a, b) =>
                b.count - a.count || a.identifier.localeCompare(b.identifier),
        );
    });

    const stationColor = $derived(
        new Map(stations.map((s, i) => [s.identifier, palette[i % palette.length]])),
    );

    const stationItems = $derived([
        { value: "", name: "Alle Trafostationen" },
        ...stations.map((s) => ({
            value: s.identifier,
            name: `${s.name} ${s.identifier} (${s.count})`,
        })),
    ]);

    const unassignedCount = $derived(
        data.memberLocations.filter(
            (/** @type {{ station_identifier: string | null }} */ m) =>
                !m.station_identifier,
        ).length,
    );

    const selected = $derived(
        stations.find((s) => s.identifier === selectedStation),
    );

    // ------------------------------------------------------------------
    // Abwaegung lokale EEG je Trafostation
    // ------------------------------------------------------------------

    // Parameter, in der Seite editierbar. Vorgaben und Quellen stehen zentral
    // in $lib/tariffs.js (Netz OÖ Netzebene 7, § 5 Abs. 1a SNE-V 2018,
    // Abgaben, Vergleichstarife). Kurz: Der EEG-Rabatt gilt nur auf den
    // Netznutzungs-Arbeitspreis (lokal 57%, regional 28%), das
    // Netzverlustentgelt bleibt. Elektrizitaetsabgabe, Erneuerbaren-
    // Foerderbeitrag und der Preisvorteil zum Lieferanten entfallen bzw.
    // gelten lokal wie regional gleich je kWh; sie zaehlen nur, weil beide
    // Varianten unterschiedlich viele kWh decken. Ab 2027 legt die E-Control
    // die Rabatte nach dem ElWG neu fest, Oktober bis Dezember 2026 gibt es
    // keinen Rabatt.
    let gridFeeCt = $state(CURRENT.grid.usageCt); // ct/kWh
    let regionalPct = $state(CURRENT.rebate.regionalPct);
    let localPct = $state(CURRENT.rebate.localPct);
    // Regelsatz, nicht der befristete 2026er Satz: die Entscheidung wirkt
    // fruehestens ab 2027.
    let elAbgabeCt = $state(CURRENT.levies.electricityTaxRegularCt);
    let foerderbeitragCt = $state(CURRENT.levies.renewableContributionCt);
    let priceAdvantageCt = $state(
        Math.round(priceAdvantageDefaultCt(CURRENT) * 100) / 100,
    ); // EEG-Bezug gegenueber dem Standardtarif der Energie AG
    // Vorteil je gedeckter kWh, der in beiden Varianten gleich anfaellt
    const otherCt = $derived(
        (Number(elAbgabeCt) || 0) +
            (Number(foerderbeitragCt) || 0) +
            (Number(priceAdvantageCt) || 0),
    );

    const balance = $derived(data.stationBalance);

    const pointsByStation = $derived(
        new Map(
            data.stationPoints.map(
                (/** @type {{ station_id: number }} */ p) => [p.station_id, p],
            ),
        ),
    );

    /**
     * @typedef {{ month: string, consumption_kwh: number, regional_coverage_kwh: number,
     *   generation_kwh: number, regional_surplus_kwh: number, local_coverage_kwh: number }} MonthRow
     */

    const emptySums = () => ({
        consumption_kwh: 0,
        regional_coverage_kwh: 0,
        generation_kwh: 0,
        regional_surplus_kwh: 0,
        local_coverage_kwh: 0,
        /** @type {MonthRow[]} */
        months: [],
    });

    const assessment = $derived.by(() => {
        if (!balance) return [];
        /** @type {Map<number, ReturnType<typeof emptySums>>} */
        const sums = new Map();
        for (const row of balance.months) {
            const s = sums.get(row.station_id) ?? emptySums();
            s.consumption_kwh += row.consumption_kwh;
            s.regional_coverage_kwh += row.regional_coverage_kwh;
            s.generation_kwh += row.generation_kwh;
            s.regional_surplus_kwh += row.regional_surplus_kwh;
            s.local_coverage_kwh += row.local_coverage_kwh;
            s.months.push(row);
            sums.set(row.station_id, s);
        }
        const fee = Number(gridFeeCt) || 0;
        const other = otherCt;
        const perKwhRegional = fee * (Number(regionalPct) || 0) / 100 + other; // ct
        const perKwhLocal = fee * (Number(localPct) || 0) / 100 + other; // ct

        return stations
            .map((st) => {
                const s = sums.get(st.id) ?? emptySums();
                const points = pointsByStation.get(st.id);
                const savingRegional = (s.regional_coverage_kwh * perKwhRegional) / 100; // €
                const savingLocal = (s.local_coverage_kwh * perKwhLocal) / 100; // €
                const delta = savingLocal - savingRegional;
                const row = {
                    ...st,
                    ...s,
                    consumption_points: points?.consumption_points ?? 0,
                    generation_points: points?.generation_points ?? 0,
                    // intern verkaufte Erzeugung: regional heute, lokal dann
                    sold_internal_regional: s.generation_kwh - s.regional_surplus_kwh,
                    sold_internal_local: s.local_coverage_kwh,
                    savingRegional,
                    savingLocal,
                    delta,
                };
                return { ...row, verdict: verdictFor(row) };
            })
            .sort((a, b) => b.delta - a.delta);
    });

    /**
     * @param {{ generation_kwh: number, count: number, savingRegional: number, savingLocal: number, delta: number }} r
     * @returns {{ label: string, color: "gray" | "yellow" | "green" | "red" }}
     */
    function verdictFor(r) {
        if (r.generation_kwh <= 0) return { label: "keine Erzeugung", color: "gray" };
        if (r.count < 2) return { label: "nur ein Mitglied", color: "gray" };
        const ref = Math.max(r.savingRegional, r.savingLocal, 1);
        if (Math.abs(r.delta) < 0.1 * ref) return { label: "knapp", color: "yellow" };
        return r.delta > 0
            ? { label: "lokal sinnvoll", color: "green" }
            : { label: "regional besser", color: "red" };
    }

    const selectedAssessment = $derived(
        assessment.find((a) => a.identifier === selectedStation),
    );

    // Detailansicht (Monatswerte) einer Station im Modal
    let detailsOpen = $state(false);

    /** @param {string} identifier */
    function openDetails(identifier) {
        selectStation(identifier);
        detailsOpen = true;
    }

    // Aus dem Modal heraus: schliessen, zur Station zoomen, Karte ins Bild
    function showOnMap() {
        detailsOpen = false;
        selectStation(selectedStation, true);
        mapContainer?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const localWorthwhile = $derived(
        assessment.filter((a) => a.verdict.label === "lokal sinnvoll").length,
    );

    // Schwelle: ab welchem Verhaeltnis lokale zu regionaler Deckung die
    // lokale EEG vorne liegt (bei gleichem sonstigen Vorteil je kWh).
    const breakEvenRatio = $derived.by(() => {
        const fee = Number(gridFeeCt) || 0;
        const other = otherCt;
        const loc = fee * (Number(localPct) || 0) / 100 + other;
        return loc > 0 ? (fee * (Number(regionalPct) || 0) / 100 + other) / loc : 0;
    });

    /** @param {number} v */
    const fmtKwh = (v) =>
        v.toLocaleString("de-AT", { maximumFractionDigits: 0 });
    /** @param {number} v */
    const fmtEur = (v) =>
        v.toLocaleString("de-AT", {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: 0,
        });
    /** @param {number} part @param {number} total */
    const fmtShare = (part, total) =>
        total > 0 ? `${Math.round((part / total) * 100)}%` : "";
    /** @param {string} iso */
    const fmtDate = (iso) =>
        iso ? new Date(iso).toLocaleDateString("de-AT") : "";
    /** @param {string} ym */
    const fmtMonth = (ym) => {
        const [y, m] = ym.split("-");
        return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-AT", {
            month: "short",
            year: "numeric",
        });
    };

    /** @param {string} identifier */
    function selectStation(identifier, fit = false) {
        selectedStation = identifier;
        if (!fit || !map || !identifier) return;
        const bounds = new maplibregl.LngLatBounds();
        let any = false;
        for (const { marker, station } of markers) {
            if (station !== identifier) continue;
            bounds.extend(marker.getLngLat());
            any = true;
        }
        if (any) map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 600 });
    }

    /** @param {{ name: string, station_identifier: string | null, station_name: string | null }} location */
    function popupContent(location) {
        const el = document.createElement("div");
        const name = document.createElement("div");
        name.className = "font-semibold";
        name.textContent = location.name;
        el.appendChild(name);
        const station = document.createElement("div");
        station.className = "text-xs text-gray-600";
        station.textContent = location.station_identifier
            ? `Trafostation ${location.station_name} ${location.station_identifier}`
            : "Trafostation unbekannt";
        el.appendChild(station);
        return el;
    }

    onMount(() => {
        // OpenFreeMap: EU-gehostete OSM-Kacheln, kein API-Key, kein Tracking.
        // Ersetzt Mapbox (US-Anbieter mit Telemetrie), siehe /datenschutz.
        map = new maplibregl.Map({
            container: mapContainer,
            style: "https://tiles.openfreemap.org/styles/liberty",
            center: [13.605, 47.69],
            zoom: 11.5,
            attributionControl: { compact: true },
            // Ein Finger scrollt die Seite weiter, erst zwei Finger bewegen
            // die Karte -- sonst bleibt man am Handy in der Karte haengen.
            cooperativeGestures: true,
            locale: {
                "CooperativeGesturesHandler.MobileHelpText":
                    "Karte mit zwei Fingern verschieben",
                "CooperativeGesturesHandler.WindowsHelpText":
                    "Karte mit Strg + Scrollen zoomen",
                "CooperativeGesturesHandler.MacHelpText":
                    "Karte mit ⌘ + Scrollen zoomen",
            },
        });
        map.addControl(new maplibregl.NavigationControl());

        for (const location of data.memberLocations) {
            if (location.latitude == null || location.longitude == null) {
                continue;
            }
            const station = location.station_identifier ?? "";
            const marker = new maplibregl.Marker({
                color: station ? stationColor.get(station) : unassignedColor,
            })
                .setLngLat([location.longitude, location.latitude])
                .setPopup(
                    new maplibregl.Popup({ offset: 30 }).setDOMContent(
                        popupContent(location),
                    ),
                )
                .addTo(map);
            // Klick auf einen Marker hebt alle Mitglieder derselben Station
            // hervor; nochmaliger Klick auf dieselbe Station hebt das auf.
            marker.getElement().addEventListener("click", () => {
                if (!station) return;
                selectStation(selectedStation === station ? "" : station);
            });
            markers.push({ marker, station });
        }
        applyHighlight();
    });

    function applyHighlight() {
        for (const { marker, station } of markers) {
            const active = !selectedStation || station === selectedStation;
            marker.setOpacity(active ? "1" : "0.2");
            marker.getElement().style.zIndex = active && selectedStation ? "1" : "0";
        }
    }

    $effect(() => {
        selectedStation;
        applyHighlight();
    });

    onDestroy(() => {
        map?.remove();
    });
</script>

<svelte:head>
    <title>ISCHLSTROM - Mitgliederkarte</title>
</svelte:head>

<div class="px-4 mt-4">
    <Heading tag="h2" class="text-xl font-semibold mb-3">
        Mitgliederkarte
    </Heading>

    <div class="flex flex-wrap items-end gap-3 mb-3">
        <div class="w-full sm:w-80">
            <Label for="station-select" class="text-xs">Trafostation</Label>
            <Select
                id="station-select"
                size="sm"
                items={stationItems}
                value={selectedStation}
                onchange={(e) => selectStation(e.currentTarget.value, true)}
            />
        </div>
        {#if selected}
            <div class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span
                    class="inline-block h-3 w-3 rounded-full"
                    style="background: {stationColor.get(selected.identifier)}"
                ></span>
                <span>
                    {selected.name} {selected.identifier}: {selected.count}
                    Mitglieder, {selected.located} auf der Karte
                </span>
                <Button size="xs" color="light" onclick={() => selectStation("")}>
                    Auswahl aufheben
                </Button>
            </div>
        {:else}
            <div class="text-sm text-gray-600 dark:text-gray-400">
                {stations.length} Trafostationen bekannt,
                {unassignedCount} Mitglieder ohne Zuordnung (grau).
                Klick auf einen Marker hebt alle Mitglieder derselben Station hervor.
            </div>
        {/if}
    </div>

    <div
        bind:this={mapContainer}
        class="h-[65dvh] md:h-[75dvh] w-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
    ></div>

    <Heading tag="h3" class="text-lg font-semibold mt-8 mb-2">
        Bilanz je Trafostation: lohnt sich eine lokale EEG?
    </Heading>

    {#if !balance}
        <Alert color="yellow">
            Die Materialized View <code>station_metering_15min</code> fehlt in
            der Datenbank. Die SQL-Definition steht in
            <code>middleware/README.md</code>; nach dem Anlegen frischt der
            EEG-Faktura-Import sie täglich mit auf.
        </Alert>
    {:else if balance.months.length === 0}
        <Alert color="yellow">
            Die View <code>station_metering_15min</code> ist leer. Bitte
            <code>REFRESH MATERIALIZED VIEW station_metering_15min</code>
            ausführen.
        </Alert>
    {:else}
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Zeitraum {fmtDate(balance.from)} bis {fmtDate(balance.to)}.
            Bei {localWorthwhile} von {assessment.length} Stationen wäre eine
            lokale EEG mit den aktuellen Parametern für die Mitglieder besser
            als der Verbleib in der regionalen EEG. Klick auf eine Station öffnet
            die Monatswerte.
        </p>

        <div class="flex flex-wrap gap-3 mb-2">
            <div class="w-44">
                <Label for="p-fee" class="text-xs">Netznutzung Arbeitspreis ct/kWh</Label>
                <Input id="p-fee" type="number" step="0.01" size="sm" bind:value={gridFeeCt} />
            </div>
            <div class="w-32">
                <Label for="p-reg" class="text-xs">Rabatt regional %</Label>
                <Input id="p-reg" type="number" step="1" size="sm" bind:value={regionalPct} />
            </div>
            <div class="w-32">
                <Label for="p-loc" class="text-xs">Rabatt lokal %</Label>
                <Input id="p-loc" type="number" step="1" size="sm" bind:value={localPct} />
            </div>
            <div class="w-40">
                <Label for="p-abgabe" class="text-xs">Elektrizitätsabgabe ct/kWh</Label>
                <Input id="p-abgabe" type="number" step="0.1" size="sm" bind:value={elAbgabeCt} />
            </div>
            <div class="w-44">
                <Label for="p-efb" class="text-xs">Erneuerbaren-Förderbeitrag ct/kWh</Label>
                <Input id="p-efb" type="number" step="0.01" size="sm" bind:value={foerderbeitragCt} />
            </div>
            <div class="w-44">
                <Label for="p-price" class="text-xs">Preisvorteil zum Lieferanten ct/kWh</Label>
                <Input id="p-price" type="number" step="0.1" size="sm" bind:value={priceAdvantageCt} />
            </div>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Vorgaben: {CURRENT.grid.operator} {CURRENT_YEAR}, Netzebene
            {CURRENT.grid.level} ohne Leistungsmessung, Arbeitspreis
            {fmtCt(CURRENT.grid.usageCt)} ct/kWh ({CURRENT.grid.source}). Der
            EEG-Rabatt gilt nur auf diesen Arbeitspreis: lokal
            {CURRENT.rebate.localPct}%, regional {CURRENT.rebate.regionalPct}%.
            Das Netzverlustentgelt ({fmtCt(CURRENT.grid.lossCt)} ct/kWh) bleibt
            in beiden Fällen. Für Strom aus der EEG entfallen zusätzlich die
            Elektrizitätsabgabe ({fmtCt(CURRENT.levies.electricityTaxRegularCt)}
            ct/kWh, {CURRENT_YEAR} befristet
            {fmtCt(CURRENT.levies.electricityTaxCt)} ct/kWh) und der
            Erneuerbaren-Förderbeitrag
            ({fmtCt(CURRENT.levies.renewableContributionCt)} ct/kWh). Der
            Preisvorteil ist die Differenz zwischen
            {CURRENT.competitors[0]?.name ?? "Lieferant"}
            ({fmtCt(CURRENT.competitors[0]?.workCt)} ct/kWh netto) und dem
            EEG-Bezugstarif ({fmtCt(CURRENT.eeg.purchaseCt)} ct/kWh). Diese
            drei Posten sind lokal wie regional gleich hoch, zählen aber, weil
            unterschiedlich viele kWh gedeckt werden. Lokal liegt vorne, sobald
            die lokale Deckung mehr als {Math.round(breakEvenRatio * 100)}% der
            regionalen Deckung erreicht.
            Ab 2027 legt die E-Control die Rabatte nach dem ElWG neu fest, von
            Oktober bis Dezember 2026 gibt es keinen Rabatt.
        </p>

        <!-- Schmale Bildschirme: eine Karte je Station statt einer breiten Tabelle -->
        <div class="grid gap-3 sm:grid-cols-2 lg:hidden">
            {#each assessment as r (r.identifier)}
                <button
                    type="button"
                    class="text-left rounded-lg border p-3 text-xs bg-white dark:bg-gray-800 {r.identifier === selectedStation
                        ? 'border-primary-500 ring-1 ring-primary-500'
                        : 'border-gray-200 dark:border-gray-700'}"
                    onclick={() => openDetails(r.identifier)}
                >
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <div class="font-semibold">
                            <span
                                class="inline-block h-2.5 w-2.5 rounded-full mr-1 align-middle"
                                style="background: {stationColor.get(r.identifier)}"
                            ></span>
                            {r.name} {r.identifier}
                        </div>
                        <Badge color={r.verdict.color} class="shrink-0">{r.verdict.label}</Badge>
                    </div>
                    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                        <dt class="text-gray-500">Mitglieder</dt>
                        <dd class="text-right">{r.count} (Zählp. {r.consumption_points} V / {r.generation_points} E)</dd>
                        <dt class="text-gray-500">Verbrauch</dt>
                        <dd class="text-right">{fmtKwh(r.consumption_kwh)} kWh</dd>
                        <dt class="text-gray-500">Erzeugung</dt>
                        <dd class="text-right">{fmtKwh(r.generation_kwh)} kWh</dd>
                        <dt class="text-gray-500">Deckung regional</dt>
                        <dd class="text-right">{fmtKwh(r.regional_coverage_kwh)} kWh <span class="text-gray-400">{fmtShare(r.regional_coverage_kwh, r.consumption_kwh)}</span></dd>
                        <dt class="text-gray-500">Deckung lokal</dt>
                        <dd class="text-right">{fmtKwh(r.local_coverage_kwh)} kWh <span class="text-gray-400">{fmtShare(r.local_coverage_kwh, r.consumption_kwh)}</span></dd>
                        <dt class="text-gray-500">Intern verkauft reg. / lok.</dt>
                        <dd class="text-right">{fmtKwh(r.sold_internal_regional)} / {fmtKwh(r.sold_internal_local)} kWh</dd>
                        <dt class="text-gray-500">Vorteil regional</dt>
                        <dd class="text-right">{fmtEur(r.savingRegional)}</dd>
                        <dt class="text-gray-500">Vorteil lokal</dt>
                        <dd class="text-right">{fmtEur(r.savingLocal)}</dd>
                        <dt class="text-gray-500">Differenz</dt>
                        <dd
                            class="text-right font-semibold {r.delta > 0
                                ? 'text-green-700 dark:text-green-400'
                                : r.delta < 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : ''}"
                        >
                            {fmtEur(r.delta)}
                        </dd>
                    </dl>
                </button>
            {/each}
        </div>

        <!-- Breite Bildschirme: Tabelle, Spaltenkoepfe duerfen umbrechen -->
        <div class="hidden lg:block">
            <Table hoverable={true} class="text-xs">
                <TableHead>
                    <TableHeadCell class="px-2">Trafostation</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Mitgl. / Zählp. V / E</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Verbrauch kWh</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Erzeugung kWh</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Deckung regional</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Deckung lokal</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Intern verkauft reg. / lok.</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Vorteil regional</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Vorteil lokal</TableHeadCell>
                    <TableHeadCell class="px-2 text-right">Differenz</TableHeadCell>
                    <TableHeadCell class="px-2">Bewertung</TableHeadCell>
                </TableHead>
                <TableBody>
                    {#each assessment as r (r.identifier)}
                        <TableBodyRow
                            class="cursor-pointer {r.identifier === selectedStation
                                ? 'bg-primary-50 dark:bg-primary-900/30'
                                : ''}"
                            onclick={() => openDetails(r.identifier)}
                        >
                            <TableBodyCell class="px-2 py-2">
                                <span
                                    class="inline-block h-2.5 w-2.5 rounded-full mr-1 align-middle"
                                    style="background: {stationColor.get(r.identifier)}"
                                ></span>
                                {r.name} {r.identifier}
                            </TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">
                                {r.count} / {r.consumption_points} / {r.generation_points}
                            </TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">{fmtKwh(r.consumption_kwh)}</TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">{fmtKwh(r.generation_kwh)}</TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">
                                {fmtKwh(r.regional_coverage_kwh)}
                                <span class="block text-gray-400">{fmtShare(r.regional_coverage_kwh, r.consumption_kwh)}</span>
                            </TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">
                                {fmtKwh(r.local_coverage_kwh)}
                                <span class="block text-gray-400">{fmtShare(r.local_coverage_kwh, r.consumption_kwh)}</span>
                            </TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">
                                {fmtKwh(r.sold_internal_regional)} / {fmtKwh(r.sold_internal_local)}
                            </TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">{fmtEur(r.savingRegional)}</TableBodyCell>
                            <TableBodyCell class="px-2 py-2 text-right">{fmtEur(r.savingLocal)}</TableBodyCell>
                            <TableBodyCell
                                class="px-2 py-2 text-right font-semibold {r.delta > 0
                                    ? 'text-green-700 dark:text-green-400'
                                    : r.delta < 0
                                      ? 'text-red-700 dark:text-red-400'
                                      : ''}"
                            >
                                {fmtEur(r.delta)}
                            </TableBodyCell>
                            <TableBodyCell class="px-2 py-2">
                                <Badge color={r.verdict.color}>{r.verdict.label}</Badge>
                            </TableBodyCell>
                        </TableBodyRow>
                    {/each}
                </TableBody>
            </Table>
        </div>

        <p class="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Deckung regional: Eigendeckung laut EEG-Faktura, also was diese
            Mitglieder heute als Teil der regionalen EEG aus der Gemeinschaft
            beziehen. Deckung lokal: je Viertelstunde das Minimum aus Verbrauch
            und Erzeugung aller Mitglieder dieser Station, also was eine lokale
            EEG nur aus diesen Mitgliedern decken könnte (dynamische Aufteilung,
            ohne gleichzeitige Teilnahme an der regionalen EEG). Vorteil je
            gedeckter kWh: Netznutzungs-Arbeitspreis × Rabatt plus entfallende
            Abgaben und Preisvorteil, die in beiden Varianten gleich sind. Intern verkauft:
            Erzeugung, die innerhalb der Gemeinschaft abgenommen wird; der Rest
            geht zum Marktpreis an den Abnehmer. Die grauen Prozentwerte sind der
            Anteil am Verbrauch der Station.
        </p>

    {/if}
</div>

<Modal
    title={selectedAssessment
        ? `${selectedAssessment.name} ${selectedAssessment.identifier}`
        : "Trafostation"}
    bind:open={detailsOpen}
    size="lg"
    outsideclose
>
    {#if selectedAssessment}
        {@const a = selectedAssessment}
        <div class="flex flex-wrap items-center gap-2 mb-3 text-sm">
            <Badge color={a.verdict.color}>{a.verdict.label}</Badge>
            <span>
                Differenz lokal zu regional:
                <span
                    class="font-semibold {a.delta > 0
                        ? 'text-green-700 dark:text-green-400'
                        : a.delta < 0
                          ? 'text-red-700 dark:text-red-400'
                          : ''}"
                >
                    {fmtEur(a.delta)}
                </span>
                im Zeitraum {fmtDate(balance?.from ?? "")} bis {fmtDate(balance?.to ?? "")}
            </span>
        </div>

        <dl class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs mb-4">
            <dt class="text-gray-500">Mitglieder</dt>
            <dd>{a.count} (Zählp. {a.consumption_points} V / {a.generation_points} E)</dd>
            <dt class="text-gray-500">Verbrauch</dt>
            <dd>{fmtKwh(a.consumption_kwh)} kWh</dd>
            <dt class="text-gray-500">Erzeugung</dt>
            <dd>{fmtKwh(a.generation_kwh)} kWh</dd>
            <dt class="text-gray-500">Intern verkauft reg. / lok.</dt>
            <dd>{fmtKwh(a.sold_internal_regional)} / {fmtKwh(a.sold_internal_local)} kWh</dd>
            <dt class="text-gray-500">Deckung regional</dt>
            <dd>{fmtKwh(a.regional_coverage_kwh)} kWh <span class="text-gray-400">{fmtShare(a.regional_coverage_kwh, a.consumption_kwh)}</span></dd>
            <dt class="text-gray-500">Deckung lokal</dt>
            <dd>{fmtKwh(a.local_coverage_kwh)} kWh <span class="text-gray-400">{fmtShare(a.local_coverage_kwh, a.consumption_kwh)}</span></dd>
            <dt class="text-gray-500">Vorteil regional</dt>
            <dd>{fmtEur(a.savingRegional)}</dd>
            <dt class="text-gray-500">Vorteil lokal</dt>
            <dd>{fmtEur(a.savingLocal)}</dd>
        </dl>

        <Table class="text-xs">
            <TableHead>
                <TableHeadCell class="px-1 sm:px-2">Monat</TableHeadCell>
                <TableHeadCell class="px-1 sm:px-2 text-right">Verbrauch kWh</TableHeadCell>
                <TableHeadCell class="px-1 sm:px-2 text-right">Erzeugung kWh</TableHeadCell>
                <TableHeadCell class="px-1 sm:px-2 text-right">Deckung regional</TableHeadCell>
                <TableHeadCell class="px-1 sm:px-2 text-right">Deckung lokal</TableHeadCell>
                <TableHeadCell class="px-1 sm:px-2 text-right">Überschuss reg. kWh</TableHeadCell>
            </TableHead>
            <TableBody>
                {#each a.months as m (m.month)}
                    <TableBodyRow>
                        <TableBodyCell class="px-1 sm:px-2 py-1.5 whitespace-nowrap">{fmtMonth(m.month)}</TableBodyCell>
                        <TableBodyCell class="px-1 sm:px-2 py-1.5 text-right">{fmtKwh(m.consumption_kwh)}</TableBodyCell>
                        <TableBodyCell class="px-1 sm:px-2 py-1.5 text-right">{fmtKwh(m.generation_kwh)}</TableBodyCell>
                        <TableBodyCell class="px-1 sm:px-2 py-1.5 text-right">
                            {fmtKwh(m.regional_coverage_kwh)}
                            <span class="block text-gray-400">{fmtShare(m.regional_coverage_kwh, m.consumption_kwh)}</span>
                        </TableBodyCell>
                        <TableBodyCell class="px-1 sm:px-2 py-1.5 text-right">
                            {fmtKwh(m.local_coverage_kwh)}
                            <span class="block text-gray-400">{fmtShare(m.local_coverage_kwh, m.consumption_kwh)}</span>
                        </TableBodyCell>
                        <TableBodyCell class="px-1 sm:px-2 py-1.5 text-right">{fmtKwh(m.regional_surplus_kwh)}</TableBodyCell>
                    </TableBodyRow>
                {/each}
            </TableBody>
        </Table>
    {/if}

    {#snippet footer()}
        <Button color="light" onclick={showOnMap}>Auf Karte zeigen</Button>
        <Button color="alternative" onclick={() => (detailsOpen = false)}>Schließen</Button>
    {/snippet}
</Modal>
