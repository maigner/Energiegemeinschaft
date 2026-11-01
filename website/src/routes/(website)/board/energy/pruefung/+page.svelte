<script>
    import { Heading, Button } from "flowbite-svelte";
    import { enhance } from "$app/forms";
    import { formatDay } from "$lib/billingCheck";

    let { data, form } = $props();

    const ev = $derived(data.evaluation);
    const problems = $derived(ev.points.filter((p) => p.pointStatus !== 'ok'));
    let showAll = $state(false);

    const kwh = (/** @type {number} */ v) => v.toLocaleString("de-AT", { maximumFractionDigits: 0 });
    const dateTime = (/** @type {string | null | undefined} */ iso) => iso
        ? new Date(iso).toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "medium", timeStyle: "short" })
        : "";
    const statusLabel = { ok: "ok", luecke: "Lücke", "keine-daten": "keine Daten", l3: "L3" };
    const statusClass = {
        ok: "text-green-700 dark:text-green-400",
        luecke: "text-red-700 dark:text-red-400 font-semibold",
        "keine-daten": "text-red-700 dark:text-red-400 font-semibold",
        l3: "text-amber-700 dark:text-amber-400 font-semibold",
    };
    const overallBox = {
        gruen: "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-200",
        gelb: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
        rot: "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200",
    };
    const overallText = { gruen: "abrechnungsreif", gelb: "mit Hinweisen", rot: "nicht abrechnungsreif" };

    let copied = $state(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(data.nachforderung);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            copied = false;
        }
    };
</script>

<svelte:head>
    <title>ISCHLSTROM - Abrechnungsprüfung</title>
</svelte:head>

<div class="px-4 mt-4 max-w-6xl mx-auto">
    <Heading tag="h4" class="mb-2">Abrechnungsprüfung {ev.period.label}</Heading>
    <p class="mb-4 text-sm text-gray-700 dark:text-gray-300">
        Datenstand aus dem täglichen EEG-Faktura-Import (05:00), Aktivierungsfenster aus Stammdaten, Podlist und
        Energystore. Der Vorstand bekommt per Signal eine Nachricht, wenn sich der Befund des offenen Quartals ändert.
    </p>

    <div class="mb-6 flex flex-wrap items-end gap-6 text-sm">
        <form method="GET" class="flex items-end gap-3">
            <label class="flex flex-col">
                <span class="text-gray-600 dark:text-gray-400">Quartal</span>
                <select name="quartal" class="rounded border-gray-300 dark:bg-gray-800 dark:border-gray-600">
                    {#each data.quarters as q}
                        <option value={q.value} selected={q.start === ev.period.start && q.end === ev.period.end}>{q.label}</option>
                    {/each}
                </select>
            </label>
            <Button type="submit" size="sm" color="green">Prüfen</Button>
        </form>
        <form method="GET" class="flex items-end gap-3">
            <label class="flex flex-col">
                <span class="text-gray-600 dark:text-gray-400">von</span>
                <input type="date" name="von" value={data.selected.von ?? ev.period.start} class="rounded border-gray-300 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <label class="flex flex-col">
                <span class="text-gray-600 dark:text-gray-400">bis</span>
                <input type="date" name="bis" value={data.selected.bis ?? ev.period.end} class="rounded border-gray-300 dark:bg-gray-800 dark:border-gray-600" />
            </label>
            <Button type="submit" size="sm" color="light">Zeitraum prüfen</Button>
        </form>
    </div>

    <div class="mb-6 rounded-lg border p-4 text-sm {overallBox[ev.overall]}">
        <p class="text-base font-semibold">
            {ev.period.label} ({formatDay(ev.period.start)} bis {formatDay(ev.period.end)}): {overallText[ev.overall]}
        </p>
        <p class="mt-1">
            {ev.counts.points} Zählpunkte im Zeitraum, {ev.counts.ok} ok,
            {ev.counts.gaps} mit Lücken ({ev.counts.missingDays} Tage), {ev.counts.noData} ohne Daten,
            {ev.counts.l3} mit L3-Werten.
            Lieferung vollständig an {ev.totals.daysComplete} von {ev.totals.daysTotal} Tagen.
        </p>
        <p class="mt-1">
            Erzeugung {kwh(ev.totals.produced)} kWh, davon zugeteilt {kwh(ev.totals.allocated)} kWh
            (Differenz {ev.totals.allocationDiff.toFixed(3)} kWh, {ev.totals.allocationOk ? 'vollständig zugeteilt' : 'nicht vollständig zugeteilt'}),
            Eigendeckung {kwh(ev.totals.selfCovered)} kWh, Überschuss {kwh(ev.totals.surplus)} kWh,
            Verbrauch {kwh(ev.totals.consumed)} kWh.
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
            {#if data.record?.billedAt}
                <span>Abgerechnet am {dateTime(data.record.billedAt)}.</span>
                <form method="POST" action="?/billed" use:enhance>
                    <input type="hidden" name="start" value={ev.period.start} />
                    <input type="hidden" name="end" value={ev.period.end} />
                    <input type="hidden" name="billed" value="false" />
                    <Button type="submit" size="xs" color="light">Markierung aufheben</Button>
                </form>
            {:else}
                <form method="POST" action="?/billed" use:enhance>
                    <input type="hidden" name="start" value={ev.period.start} />
                    <input type="hidden" name="end" value={ev.period.end} />
                    <input type="hidden" name="billed" value="true" />
                    <Button type="submit" size="xs" color="green">Als abgerechnet markieren</Button>
                </form>
                <span class="text-xs">Danach meldet Signal zu diesem Zeitraum nichts mehr.</span>
            {/if}
            {#if data.record?.checkedAt}
                <span class="text-xs">Letzter Cron-Lauf {dateTime(data.record.checkedAt)}.</span>
            {/if}
        </div>
    </div>

    {#if data.nachforderung}
        <Heading tag="h5" class="mb-2">Nachforderung bei Netz OÖ</Heading>
        <p class="mb-2 text-sm text-gray-700 dark:text-gray-300">
            Ein Zählpunkt je Zeile: Zählpunkt, Mitglied, fehlende Tage. In EEG-Faktura die Energiedaten für diese
            Tage anfordern; nach der Lieferung holt der Import sie am nächsten Morgen.
        </p>
        <textarea readonly rows={Math.min(12, data.nachforderung.split('\n').length + 1)}
                  class="mb-2 w-full rounded border-gray-300 font-mono text-xs dark:bg-gray-800 dark:border-gray-600">{data.nachforderung}</textarea>
        <Button size="xs" color="light" onclick={copy} class="mb-4">{copied ? 'Kopiert' : 'In die Zwischenablage'}</Button>

        <details class="mb-6 rounded-lg border border-gray-300 p-4 text-sm dark:border-gray-600">
            <summary class="cursor-pointer font-semibold">Nachforderung direkt aus dieser Seite senden</summary>
            <p class="mt-2 mb-2 text-gray-700 dark:text-gray-300">
                EEG-Faktura erlaubt keine Anmeldung aus einem Skript. Deshalb: in EEG-Faktura im Browser anmelden,
                Entwicklerwerkzeuge öffnen (F12, Reiter Netzwerk), eine beliebige Anfrage an <span class="font-mono">/api/</span>
                anklicken und den Wert des Headers <span class="font-mono">Authorization</span> (nach "Bearer") hier einfügen.
                Das Token gilt nur wenige Minuten und wird nicht gespeichert. Gesendet wird je Zählpunkt der Bereich vom
                ersten bis zum letzten fehlenden Tag; was Netz OÖ liefert, holt der Import am nächsten Morgen.
            </p>
            <form method="POST" action="?/nachforderung" use:enhance class="flex flex-wrap items-end gap-3">
                <input type="hidden" name="start" value={ev.period.start} />
                <input type="hidden" name="end" value={ev.period.end} />
                <label class="flex grow flex-col">
                    <span class="text-gray-600 dark:text-gray-400">Bearer-Token</span>
                    <input type="password" name="token" autocomplete="off" class="rounded border-gray-300 font-mono text-xs dark:bg-gray-800 dark:border-gray-600" />
                </label>
                <label class="flex items-center gap-2">
                    <input type="checkbox" name="confirm" class="rounded" />
                    <span>Anfrage für {problems.filter((p) => p.missingDays.length > 0).length} Zählpunkte wirklich senden</span>
                </label>
                <Button type="submit" size="sm" color="green">Senden</Button>
            </form>
            {#if form?.request?.error}
                <p class="mt-3 text-red-700 dark:text-red-400">{form.request.error}</p>
            {/if}
            {#if form?.request?.ok}
                <div class="mt-3 text-green-800 dark:text-green-300">
                    {#if form.request.message}
                        <p>{form.request.message}</p>
                    {:else}
                        <p>
                            Gesendet für {form.request.points} Zählpunkte{form.request.requested != null ? `, ${form.request.requested} angefordert` : ''}{form.request.skipped.length ? `, ${form.request.skipped.length} übersprungen` : ''}.
                        </p>
                        {#if form.request.skipped.length}
                            <ul class="mt-1 list-disc pl-5 font-mono text-xs">
                                {#each form.request.skipped as s}
                                    <li>{s.meteringPoint}: {s.reason}{s.until ? ` (bis ${dateTime(new Date(s.until).toISOString())})` : ''}</li>
                                {/each}
                            </ul>
                        {/if}
                    {/if}
                </div>
            {/if}
            {#if data.record?.summary?.lastRequest}
                <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Letzte Nachforderung {dateTime(data.record.summary.lastRequest.at)} für {data.record.summary.lastRequest.points} Zählpunkte.
                </p>
            {/if}
        </details>
    {/if}

    {#if ev.activation.mismatches.length > 0 || ev.activation.missingInPodlist.length > 0}
        <Heading tag="h5" class="mb-2">Aktivierungsfenster</Heading>
        <div class="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            {#if ev.activation.missingInPodlist.length > 0}
                <p class="mb-1 font-semibold">Aktiv, aber nicht in der Podlist vom {dateTime(ev.activation.podlistDate)} ({ev.activation.missingInPodlist.length}):</p>
                <ul class="mb-3 list-disc pl-5 font-mono">
                    {#each ev.activation.missingInPodlist as r}
                        <li>{r.identifier} (Mitglied {r.memberNumber}, {r.memberName})</li>
                    {/each}
                </ul>
            {/if}
            {#if ev.activation.mismatches.length > 0}
                <p class="mb-1 font-semibold">Quellen widersprechen sich ({ev.activation.mismatches.length}):</p>
                <ul class="list-disc pl-5">
                    {#each ev.activation.mismatches as r}
                        <li class="py-0.5"><span class="font-mono">{r.identifier}</span> (Mitglied {r.memberNumber}, {r.memberName}): {r.problems.join('; ')}</li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}

    <div class="mb-2 flex items-center justify-between">
        <Heading tag="h5">Zählpunkte {showAll ? `(${ev.points.length})` : `mit Befund (${problems.length})`}</Heading>
        <Button size="xs" color="light" onclick={() => (showAll = !showAll)}>{showAll ? 'Nur Befunde' : 'Alle zeigen'}</Button>
    </div>
    {#if (showAll ? ev.points : problems).length === 0}
        <p class="mb-6 text-sm text-green-700 dark:text-green-400">Alle Zählpunkte haben vollständige, verlässliche Daten im Zeitraum.</p>
    {:else}
        <div class="overflow-x-auto">
            <table class="mb-6 w-full text-left text-xs">
                <thead class="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    <tr>
                        <th class="px-2 py-1">Zählpunkt</th>
                        <th class="px-2 py-1">Mitglied</th>
                        <th class="px-2 py-1">Richtung</th>
                        <th class="px-2 py-1">Fenster</th>
                        <th class="px-2 py-1">Status</th>
                        <th class="px-2 py-1">Fehlende Tage</th>
                        <th class="px-2 py-1">L3-Tage</th>
                        <th class="px-2 py-1">Tarif</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                    {#each (showAll ? ev.points : problems) as p}
                        <tr>
                            <td class="px-2 py-1 font-mono">{p.identifier}</td>
                            <td class="px-2 py-1">{p.memberNumber} {p.memberName}</td>
                            <td class="px-2 py-1">{p.direction === 'GENERATION' ? 'Erzeugung' : 'Verbrauch'}</td>
                            <td class="px-2 py-1 whitespace-nowrap">{formatDay(p.windowStart)} bis {formatDay(p.windowEnd)}</td>
                            <td class="px-2 py-1 {statusClass[p.pointStatus]}">{statusLabel[p.pointStatus]}</td>
                            <td class="px-2 py-1">{p.missingDays.length ? `${p.missingDays.length}: ${p.missingRanges}` : ''}</td>
                            <td class="px-2 py-1">{p.l3Days.length ? `${p.l3Days.length}: ${p.l3Ranges}` : ''}</td>
                            <td class="px-2 py-1 {p.subscriptionName ? '' : 'text-red-700 dark:text-red-400'}">{p.subscriptionName ?? 'fehlt'}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}

    <p class="mb-8 text-xs text-gray-500 dark:text-gray-400">
        Lücken und L3-Werte stammen aus dem Qualitätskennzeichen des Energystores (seit November 2026 gespeichert;
        ältere Werte ohne Kennzeichen zählen als vorhanden und verlässlich). Stammdatenprüfungen (Tarif, Besitzwechsel):
        <a href="/board/members/import" class="underline">Stammdaten-Import</a>.
    </p>
</div>
