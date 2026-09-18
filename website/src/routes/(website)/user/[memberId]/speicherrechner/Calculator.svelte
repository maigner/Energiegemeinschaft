<script>
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import {
        Alert,
        Badge,
        Card,
        Input,
        Label,
        Toggle,
        Accordion,
        AccordionItem,
    } from "flowbite-svelte";
    import { evaluate } from "$lib/batteryCalculator";
    import {
        CURRENT,
        CURRENT_YEAR,
        BATTERY_CALCULATOR,
        importPricesCt,
        fmtCt,
    } from "$lib/tariffs";

    /** @type {{ series: any }} */
    let { series } = $props();

    // Serienfarben (validierte Palette, wie in PerformanceChart): die
    // Gemeinschaft hat im ganzen Mitgliederbereich dieselbe Farbe
    const COLOR_SELF_USE = "#2a78d6";
    const COLOR_PEAK = "#eb6834";
    const COLOR_COMMUNITY = "#1baf7a";
    const COLOR_BEFORE = "#9ca3af";

    // Wh vom Server -> kWh fuer die Rechnung
    const toKwh = (/** @type {number[]} */ values) =>
        Float64Array.from(values, (v) => v / 1000);
    let s = $derived({
        days: series.days,
        imp: toKwh(series.imp),
        impEeg: toKwh(series.impEeg),
        exp: toKwh(series.exp),
        expRest: toKwh(series.expRest),
        uncovered: toKwh(series.uncovered),
        months: series.months,
    });

    // Volleinspeiser erkennt man daran, dass Bezug und Einspeisung
    // gleichzeitig laufen; dort haengt die PV an einem eigenen Zaehler und
    // ein Speicher hinter dem Bezugszaehler kann sie nicht laden
    let looksLikeFullFeedIn = $derived.by(() => {
        let simultaneous = 0;
        let exportTotal = 0;
        for (let t = 0; t < s.imp.length; t++) {
            simultaneous += Math.min(s.imp[t], s.exp[t]);
            exportTotal += s.exp[t];
        }
        return exportTotal > 0 && simultaneous / exportTotal > 0.25;
    });

    const defaults = importPricesCt(CURRENT);
    const round2 = (/** @type {number} */ v) => Math.round(v * 100) / 100;

    let eeg = $state(true);
    let peak = $state(false);
    let peakLimitKw = $state(BATTERY_CALCULATOR.powerTariff.thresholdKw);

    let gridCt = $state(round2(defaults.gridCt));
    let eegCt = $state(round2(defaults.eegCt));
    let feedInEegCt = $state(CURRENT.eeg.feedInCt ?? 0);
    let feedInRestCt = $state(BATTERY_CALCULATOR.restFeedIn.ct);
    let powerEurPerKwYear = $state(BATTERY_CALCULATOR.powerTariff.eurPerKwYear);
    let powerEurPerKwYearAbove = $state(BATTERY_CALCULATOR.powerTariff.eurPerKwYearAbove);
    let costFixEur = $state(BATTERY_CALCULATOR.battery.costFixEur);
    let costPerKwhEur = $state(BATTERY_CALCULATOR.battery.costPerKwhEur);
    let lifetimeYears = $state(BATTERY_CALCULATOR.battery.lifetimeYears);
    let roundTripPct = $state(BATTERY_CALCULATOR.battery.roundTripEff * 100);

    // leere oder unsinnige Eingaben nicht in die Rechnung lassen
    const num = (
        /** @type {any} */ value,
        /** @type {number} */ fallback,
        min = 0,
        max = Infinity,
    ) => {
        const v = Number(value);
        return value === "" || value == null || !Number.isFinite(v)
            ? fallback
            : Math.min(max, Math.max(min, v));
    };

    let result = $derived(
        evaluate(
            s,
            {
                gridCt: num(gridCt, defaults.gridCt),
                eegCt: num(eegCt, defaults.eegCt),
                feedInEegCt: num(feedInEegCt, 0),
                feedInRestCt: num(feedInRestCt, 0),
                powerEurPerKwYear: num(powerEurPerKwYear, 0),
                powerEurPerKwYearAbove: num(powerEurPerKwYearAbove, 0),
                powerThresholdKw: BATTERY_CALCULATOR.powerTariff.thresholdKw,
                powerMinKw: BATTERY_CALCULATOR.powerTariff.minKw,
            },
            {
                eeg,
                peak,
                peakLimitKw: num(peakLimitKw, 10, 1, 100),
                powerPerKwh: BATTERY_CALCULATOR.battery.powerPerKwh,
                maxPowerKw: BATTERY_CALCULATOR.battery.maxPowerKw,
                roundTripEff: num(roundTripPct, 90, 50, 100) / 100,
                costFixEur: num(costFixEur, 0),
                costPerKwhEur: num(costPerKwhEur, 0),
                lifetimeYears: num(lifetimeYears, 15, 1, 40),
            },
        ),
    );

    /** @type {number | null} vom Mitglied gewaehlte Groesse; null = Empfehlung */
    let selectedKwh = $state(null);
    let shownKwh = $derived(selectedKwh ?? result.recommendedKwh);
    let shown = $derived(
        result.sizes.find((size) => size.capacityKwh === shownKwh) ?? result.sizes[0],
    );

    const fmtInt = (/** @type {number} */ v) => Math.round(v).toLocaleString("de-AT");
    const fmtEur = (/** @type {number} */ v) => `${fmtInt(v)} €`;
    const fmtKw = (/** @type {number} */ v) =>
        v.toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fmtYears = (/** @type {number} */ v) =>
        Number.isFinite(v) && v < 100
            ? `${v.toLocaleString("de-AT", { maximumFractionDigits: 1 })} Jahre`
            : "nie";
    const fmtDate = (/** @type {string} */ iso) =>
        new Date(iso).toLocaleDateString("de-AT", {
            timeZone: "Europe/Vienna",
            month: "long",
            year: "numeric",
        });
    const fmtMonth = (/** @type {string} */ label) => {
        const [year, month] = label.split("-").map(Number);
        return new Date(year, month - 1, 1).toLocaleDateString("de-AT", {
            month: "short",
            year: "2-digit",
        });
    };

    let peakBefore = $derived(Math.max(...result.baseline.monthPeaksKw));
    let peakAfter = $derived(Math.max(...shown.monthPeaksKw));

    let tiles = $derived.by(() => {
        const importCut = result.baseline.importKwh - shown.importKwh;
        /** @type {{ label: string, value: string, detail: string }[]} */
        const list = [
            {
                label: "Nutzen pro Jahr",
                value: fmtEur(shown.valueEur),
                detail: `Anschaffung rund ${fmtEur(shown.costEur)}`,
            },
            {
                label: "Amortisation",
                value: fmtYears(shown.paybackYears),
                detail:
                    shown.netEur > 0
                        ? `${fmtEur(shown.netEur)} Überschuss in ${num(lifetimeYears, 15)} Jahren`
                        : `länger als die Lebensdauer von ${num(lifetimeYears, 15)} Jahren`,
            },
            {
                label: "Weniger Netzbezug",
                value: `${fmtInt(importCut)} kWh`,
                detail: `${Math.round((importCut / result.baseline.importKwh) * 100)} % von ${fmtInt(result.baseline.importKwh)} kWh im Jahr`,
            },
        ];
        if (eeg) {
            list.push({
                label: "Im Dunkeln an die Gemeinschaft",
                value: `${fmtInt(shown.eegFeedKwh)} kWh`,
                detail: "pro Jahr aus der Batterie",
            });
        }
        if (peak) {
            list.push({
                label: "Höchste Viertelstunde",
                value: `${fmtKw(peakAfter)} kW`,
                detail: `heute ${fmtKw(peakBefore)} kW`,
            });
        }
        return list;
    });

    // ausgeschriebene Klassen, damit Tailwind sie findet
    /** @type {Record<number, string>} */
    const TILE_COLUMNS = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

    const baseChart = {
        fontFamily: "Inter, sans-serif",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
    };
    const eurAxis = {
        labels: { formatter: (/** @type {number} */ v) => fmtInt(v) },
    };

    /** @type {import("apexcharts").ApexOptions} */
    let valueChart = $derived({
        chart: {
            ...baseChart,
            type: "bar",
            height: "320px",
            stacked: true,
            events: {
                dataPointSelection: (_event, _chart, config) => {
                    selectedKwh = result.sizes[config.dataPointIndex].capacityKwh;
                },
            },
        },
        plotOptions: {
            bar: {
                columnWidth: "45%",
                borderRadius: 4,
                borderRadiusApplication: "end",
                borderRadiusWhenStacked: "last",
            },
        },
        // 2 px Flaechenfarbe zwischen den Segmenten
        stroke: { show: true, width: 2, colors: ["#ffffff"] },
        states: { active: { filter: { type: "none" } } },
        dataLabels: { enabled: false },
        legend: { show: true, position: "top", horizontalAlign: "left" },
        grid: { show: true, strokeDashArray: 4 },
        series: [
            {
                name: "Eigenverbrauch",
                data: result.sizes.map((size) => Math.round(size.selfUseEur)),
                color: COLOR_SELF_USE,
            },
            ...(peak
                ? [
                      {
                          name: "Leistungspreis und Spitzenkappung",
                          data: result.sizes.map((size) => Math.round(size.peakEur)),
                          color: COLOR_PEAK,
                      },
                  ]
                : []),
            ...(eeg
                ? [
                      {
                          name: "Entladen in die Gemeinschaft",
                          data: result.sizes.map((size) => Math.round(size.eegEur)),
                          color: COLOR_COMMUNITY,
                      },
                  ]
                : []),
        ],
        xaxis: {
            categories: result.sizes.map((size) => `${size.capacityKwh} kWh`),
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        // ein Anteil kann leicht negativ sein (Speicherverluste beim Entladen
        // in die Gemeinschaft); erst ab einem sichtbaren Betrag darf die
        // Achse unter null gehen
        yaxis: {
            ...eurAxis,
            title: { text: "Euro pro Jahr" },
            min: result.sizes.some((size) => Math.min(size.peakEur, size.eegEur) < -5)
                ? undefined
                : 0,
        },
        tooltip: {
            shared: true,
            intersect: false,
            y: { formatter: (/** @type {number} */ v) => `${fmtInt(v)} € pro Jahr` },
        },
    });

    /** @type {import("apexcharts").ApexOptions} */
    let peakChart = $derived({
        chart: { ...baseChart, type: "bar", height: "280px" },
        plotOptions: {
            bar: { columnWidth: "60%", borderRadius: 4, borderRadiusApplication: "end" },
        },
        stroke: { show: true, width: 2, colors: ["#ffffff"] },
        dataLabels: { enabled: false },
        legend: { show: true, position: "top", horizontalAlign: "left" },
        grid: { show: true, strokeDashArray: 4 },
        series: [
            {
                name: "Heute",
                data: result.baseline.monthPeaksKw.map((v) => Math.round(v * 10) / 10),
                color: COLOR_BEFORE,
            },
            {
                name: `Mit ${shown.capacityKwh} kWh Speicher`,
                data: shown.monthPeaksKw.map((v) => Math.round(v * 10) / 10),
                color: COLOR_SELF_USE,
            },
        ],
        annotations: {
            yaxis: [
                {
                    y: BATTERY_CALCULATOR.powerTariff.thresholdKw,
                    borderColor: "#52514e",
                    strokeDashArray: 4,
                    label: {
                        text: `${BATTERY_CALCULATOR.powerTariff.thresholdKw} kW: darüber doppelter Leistungspreis`,
                        position: "left",
                        textAnchor: "start",
                        style: { color: "#52514e", background: "#ffffff" },
                    },
                },
            ],
        },
        xaxis: {
            categories: s.months.map((/** @type {{ label: string }} */ m) => fmtMonth(m.label)),
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            title: { text: "kW (höchste Viertelstunde)" },
            labels: { formatter: (/** @type {number} */ v) => fmtKw(v) },
        },
        tooltip: {
            shared: true,
            intersect: false,
            y: { formatter: (/** @type {number} */ v) => `${fmtKw(v)} kW` },
        },
    });
</script>

<p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
    Datenbasis: {fmtDate(series.from)} bis {fmtDate(series.to)}
    ({Math.round(series.days)} Tage mit vollständigen Messwerten), am
    Netzanschluss {fmtInt(result.baseline.importKwh)} kWh Bezug und
    {fmtInt(result.baseline.exportKwh)} kWh Einspeisung pro Jahr.
    {#if series.days < 330}
        Weil kein ganzes Jahr vorliegt, sind die Jahreswerte hochgerechnet
        und je nach Jahreszeit verzerrt.
    {/if}
</p>

{#if looksLikeFullFeedIn}
    <Alert color="yellow" class="mb-4">
        Bezug und Einspeisung laufen bei Ihnen häufig gleichzeitig. Das
        deutet auf eine Volleinspeisung mit eigenem Zähler hin. Ein Speicher
        hinter dem Bezugszähler kann in diesem Fall nicht aus der PV-Anlage
        laden, das Ergebnis gilt erst nach einem Umbau auf
        Überschusseinspeisung.
    </Alert>
{/if}

<Card size="xl" class="p-4 sm:p-5 mb-4 max-w-none shadow-none">
    <div class="grid gap-4 md:grid-cols-2">
        <div>
            <Toggle bind:checked={eeg}>In die Gemeinschaft entladen</Toggle>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Was Ihr Haushalt bis zum nächsten Laden nicht braucht, geht
                abends und nachts an die Gemeinschaft, so wie es das
                ISCHLSTROM-Speichermanagement steuert.
            </p>
        </div>
        <div>
            <Toggle bind:checked={peak}>Spitzen kappen (Netzentgelte ab 2027)</Toggle>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Ab 2027 zählt für das Netzentgelt die höchste Viertelstunde
                Bezug im Monat, über
                {BATTERY_CALCULATOR.powerTariff.thresholdKw} kW zum doppelten
                Preis. Der Speicher hält dafür eine Reserve zurück.
            </p>
            {#if peak}
                <div class="flex items-center gap-2 mt-2">
                    <Label for="peak-limit" class="text-xs whitespace-nowrap">Zielleistung</Label>
                    <Input
                        id="peak-limit"
                        type="number"
                        min="1"
                        max="100"
                        step="0.5"
                        size="sm"
                        class="w-24"
                        bind:value={peakLimitKw}
                    />
                    <span class="text-xs text-gray-500">kW</span>
                </div>
            {/if}
        </div>
    </div>
</Card>

<div class="rounded-lg border border-primary-200 bg-primary-50 dark:bg-gray-800 dark:border-gray-700 p-4 mb-4">
    <p class="text-xs uppercase tracking-wide text-primary-700 dark:text-primary-400">
        Empfehlung
    </p>
    <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">
        {result.recommendedKwh} kWh
        <span class="text-base font-normal text-gray-500">nutzbare Kapazität</span>
    </p>
    <p class="text-sm text-gray-700 dark:text-gray-300 mt-1">
        {#if result.pays}
            Bei dieser Größe bleibt über {num(lifetimeYears, 15)} Jahre am
            meisten übrig: Nutzen minus Anschaffung. Größere Speicher
            bringen zwar mehr, aber jede weitere Kilowattstunde immer
            weniger.
        {:else}
            Mit den unten stehenden Annahmen verdient in
            {num(lifetimeYears, 15)} Jahren keine Größe ihre Anschaffung
            zurück. Am nächsten kommt dem diese Größe. Ein Speicher kann
            trotzdem sinnvoll sein, etwa für Notstrom oder weil Sie mit
            höheren Strompreisen rechnen; die Annahmen lassen sich anpassen.
        {/if}
    </p>
</div>

<div class="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Speichergröße wählen">
    <span class="text-xs text-gray-500 mr-1">Details für</span>
    {#each result.sizes as size}
        <button
            type="button"
            class="px-2.5 py-1 rounded-full text-xs border transition-colors
                {size.capacityKwh === shownKwh
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'}"
            aria-pressed={size.capacityKwh === shownKwh}
            onclick={() => (selectedKwh = size.capacityKwh)}
        >
            {size.capacityKwh} kWh{size.capacityKwh === result.recommendedKwh ? " ★" : ""}
        </button>
    {/each}
</div>

<div class="grid grid-cols-2 md:grid-cols-3 {TILE_COLUMNS[tiles.length]} gap-3 mb-6">
    {#each tiles as tile}
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p class="text-xs text-gray-500 dark:text-gray-400">{tile.label}</p>
            <p class="text-xl font-bold text-gray-900 dark:text-white mt-1 whitespace-nowrap">
                {tile.value}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tile.detail}</p>
        </div>
    {/each}
</div>

<Card size="xl" class="p-4 sm:p-5 mb-4 max-w-none shadow-none">
    <h5 class="text-base font-semibold text-gray-900 dark:text-white">
        Jährlicher Nutzen nach Speichergröße
    </h5>
    <p class="text-xs text-gray-500 dark:text-gray-400">
        Ersparnis gegenüber heute in Euro pro Jahr. Ein Klick auf eine Säule
        zeigt die Details dieser Größe.
    </p>
    <Chart options={valueChart} />
</Card>

{#if peak}
    <Card size="xl" class="p-4 sm:p-5 mb-4 max-w-none shadow-none">
        <h5 class="text-base font-semibold text-gray-900 dark:text-white">
            Höchste Viertelstunde Netzbezug je Monat
        </h5>
        <p class="text-xs text-gray-500 dark:text-gray-400">
            Dieser Wert bestimmt ab 2027 den Leistungspreis des Monats.
            {#if shown.reserveShare > 0}
                Gerechnet mit {Math.round(shown.reserveShare * 100)} % der
                Kapazität als Reserve für Spitzen über
                {fmtKw(num(peakLimitKw, 10, 1, 100))} kW; die Reserve wird
                bei Bedarf aus dem Netz nachgeladen
                ({fmtInt(shown.gridChargeKwh)} kWh pro Jahr).
            {:else}
                Bei dieser Größe lohnt sich keine eigene Reserve für
                Spitzen; der Speicher senkt sie nur, wenn er ohnehin
                geladen ist.
            {/if}
        </p>
        <Chart options={peakChart} />
    </Card>
{/if}

<Card size="xl" class="p-4 sm:p-5 mb-4 max-w-none shadow-none">
    <h5 class="text-base font-semibold text-gray-900 dark:text-white mb-2">
        Alle Größen im Vergleich
    </h5>
    <div class="overflow-x-auto">
        <table class="w-full text-sm text-right text-gray-700 dark:text-gray-300">
            <thead class="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                    <th class="py-2 pr-3 text-left font-medium">Größe</th>
                    <th class="py-2 px-3 font-medium">Leistung</th>
                    <th class="py-2 px-3 font-medium">Nutzen pro Jahr</th>
                    <th class="py-2 px-3 font-medium">Anschaffung</th>
                    <th class="py-2 px-3 font-medium">Amortisation</th>
                    <th class="py-2 px-3 font-medium">Netzbezug</th>
                    {#if eeg}
                        <th class="py-2 px-3 font-medium">An die Gemeinschaft</th>
                    {/if}
                    {#if peak}
                        <th class="py-2 px-3 font-medium">Höchste Spitze</th>
                    {/if}
                    <th class="py-2 pl-3 font-medium">Vollzyklen</th>
                </tr>
            </thead>
            <tbody>
                {#each result.sizes as size}
                    <tr
                        class="border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700
                            {size.capacityKwh === shownKwh ? 'bg-primary-50 dark:bg-gray-700' : ''}"
                        onclick={() => (selectedKwh = size.capacityKwh)}
                    >
                        <td class="py-2 pr-3 text-left whitespace-nowrap font-medium text-gray-900 dark:text-white">
                            {size.capacityKwh} kWh
                            {#if size.capacityKwh === result.recommendedKwh}
                                <Badge color="green" class="ml-1">Empfehlung</Badge>
                            {/if}
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap">{fmtKw(size.powerKw)} kW</td>
                        <td class="py-2 px-3 whitespace-nowrap">{fmtEur(size.valueEur)}</td>
                        <td class="py-2 px-3 whitespace-nowrap">{fmtEur(size.costEur)}</td>
                        <td class="py-2 px-3 whitespace-nowrap">{fmtYears(size.paybackYears)}</td>
                        <td class="py-2 px-3 whitespace-nowrap">{fmtInt(size.importKwh)} kWh</td>
                        {#if eeg}
                            <td class="py-2 px-3 whitespace-nowrap">{fmtInt(size.eegFeedKwh)} kWh</td>
                        {/if}
                        {#if peak}
                            <td class="py-2 px-3 whitespace-nowrap">
                                {fmtKw(Math.max(...size.monthPeaksKw))} kW
                            </td>
                        {/if}
                        <td class="py-2 pl-3 whitespace-nowrap">{fmtInt(size.cycles)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Ohne Speicher: {fmtInt(result.baseline.importKwh)} kWh Netzbezug{#if peak},
            höchste Spitze {fmtKw(peakBefore)} kW{/if}. Vollzyklen pro Jahr;
        übliche Speicher sind auf 6.000 und mehr ausgelegt.
    </p>
</Card>

<Accordion flush class="mb-4">
    <AccordionItem>
        {#snippet header()}Annahmen anpassen{/snippet}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
                <Label for="grid-ct" class="text-xs mb-1">Strom vom Lieferanten, ct/kWh brutto</Label>
                <Input id="grid-ct" type="number" min="0" step="0.1" size="sm" bind:value={gridCt} />
                <p class="text-xs text-gray-500 mt-1">
                    {defaults.supplierName ?? "Lieferant"} samt Netzentgelt,
                    Abgaben und USt, Stand {CURRENT_YEAR}
                </p>
            </div>
            <div>
                <Label for="eeg-ct" class="text-xs mb-1">Strom aus der Gemeinschaft, ct/kWh brutto</Label>
                <Input id="eeg-ct" type="number" min="0" step="0.1" size="sm" bind:value={eegCt} />
                <p class="text-xs text-gray-500 mt-1">
                    {fmtCt(CURRENT.eeg.purchaseCt)} ct ISCHLSTROM-Tarif plus
                    reduziertes Netzentgelt
                </p>
            </div>
            <div>
                <Label for="feedin-eeg-ct" class="text-xs mb-1">Einspeisung an die Gemeinschaft, ct/kWh</Label>
                <Input id="feedin-eeg-ct" type="number" min="0" step="0.1" size="sm" bind:value={feedInEegCt} />
            </div>
            <div>
                <Label for="feedin-rest-ct" class="text-xs mb-1">Einspeisung an Ihren Abnehmer, ct/kWh</Label>
                <Input id="feedin-rest-ct" type="number" min="0" step="0.1" size="sm" bind:value={feedInRestCt} />
                <p class="text-xs text-gray-500 mt-1">
                    Vorbelegt: {BATTERY_CALCULATOR.restFeedIn.note}. Tragen
                    Sie den Tarif Ihres Abnehmers ein; er entscheidet, wie
                    viel das Speichern gegenüber dem Einspeisen bringt.
                </p>
            </div>
            <div>
                <Label for="cost-fix" class="text-xs mb-1">Speicher: Fixkosten samt Einbau, €</Label>
                <Input id="cost-fix" type="number" min="0" step="100" size="sm" bind:value={costFixEur} />
            </div>
            <div>
                <Label for="cost-kwh" class="text-xs mb-1">Speicher: Kosten je kWh, €</Label>
                <Input id="cost-kwh" type="number" min="0" step="10" size="sm" bind:value={costPerKwhEur} />
            </div>
            <div>
                <Label for="lifetime" class="text-xs mb-1">Lebensdauer, Jahre</Label>
                <Input id="lifetime" type="number" min="1" max="40" step="1" size="sm" bind:value={lifetimeYears} />
            </div>
            <div>
                <Label for="efficiency" class="text-xs mb-1">Wirkungsgrad Laden und Entladen, %</Label>
                <Input id="efficiency" type="number" min="50" max="100" step="1" size="sm" bind:value={roundTripPct} />
            </div>
            {#if peak}
                <div>
                    <Label for="power-low" class="text-xs mb-1">
                        Leistungspreis bis {BATTERY_CALCULATOR.powerTariff.thresholdKw} kW, €/kW pro Jahr
                    </Label>
                    <Input id="power-low" type="number" min="0" step="1" size="sm" bind:value={powerEurPerKwYear} />
                </div>
                <div>
                    <Label for="power-high" class="text-xs mb-1">
                        Leistungspreis darüber, €/kW pro Jahr
                    </Label>
                    <Input id="power-high" type="number" min="0" step="1" size="sm" bind:value={powerEurPerKwYearAbove} />
                    <p class="text-xs text-gray-500 mt-1">
                        Vorläufige Werte der Einstiegsstufe 2027; die
                        Tarifverordnung der E-Control steht noch aus. In der
                        Endstufe sind rund 34 und 68 €/kW angekündigt.
                    </p>
                </div>
            {/if}
        </div>
    </AccordionItem>
    <AccordionItem>
        {#snippet header()}So wird gerechnet{/snippet}
        <ul class="list-disc pl-5 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
            <li>
                Grundlage sind die Viertelstundenwerte Ihres Netzzählers:
                Bezug und Einspeisung. Den direkt verbrauchten Sonnenstrom
                sieht der Zähler nicht; für den Speicher spielt er keine
                Rolle, denn laden kann er nur, was sonst eingespeist würde.
            </li>
            <li>
                Haben Sie schon einen Speicher, steckt er in den Messwerten.
                Der Rechner zeigt dann, was zusätzliche Kapazität bringt.
            </li>
            <li>
                Jede gespeicherte Kilowattstunde fehlt bei der Einspeisung.
                Gegengerechnet wird je Viertelstunde der Erlös, den Sie
                tatsächlich hatten: der Anteil an die Gemeinschaft zum
                ISCHLSTROM-Tarif, der Rest zum Tarif Ihres Abnehmers.
            </li>
            <li>
                Entladen in die Gemeinschaft: Der Speicher gibt nur ab, was
                Ihr Haushalt bis zum nächsten Laden nicht braucht (mit 15 %
                Sicherheitsaufschlag), nur wenn Ihre PV nicht liefert und nur
                so viel, wie der Gemeinschaft in dieser Viertelstunde
                tatsächlich gefehlt hat{#if !series.communityFromView}
                    (näherungsweise zwischen 18 und 8 Uhr){/if}. Für Sie
                selbst ist der Effekt klein, weil beim Speichern rund
                {100 - Math.round(num(roundTripPct, 90, 50, 100))} % verloren
                gehen. Der Nutzen liegt bei den anderen Mitgliedern, die
                abends Gemeinschaftsstrom statt Strom vom Lieferanten
                bekommen.
            </li>
            <li>
                Spitzenkappung: Der Rechner probiert für jede Größe mehrere
                Reserven (0 bis 50 % der Kapazität) und nimmt die günstigste.
                Nehmen mehrere Bezugszählpunkte teil, werden sie
                zusammengezählt; der Netzbetreiber rechnet die Leistung je
                Zählpunkt ab.
            </li>
            <li>
                Lade- und Entladeleistung:
                {fmtKw(BATTERY_CALCULATOR.battery.powerPerKwh)} kW je kWh
                Kapazität, höchstens {BATTERY_CALCULATOR.battery.maxPowerKw} kW.
                Nicht berücksichtigt sind Förderungen, Alterung des
                Speichers und künftige Preisänderungen.
            </li>
        </ul>
    </AccordionItem>
</Accordion>
