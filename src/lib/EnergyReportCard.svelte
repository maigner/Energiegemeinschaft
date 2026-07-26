<script>
  import StatusPill from "$lib/StatusPill.svelte";

  let { report } = $props();

  const fmt = (d) => d ?? "—";

  let energy = $derived(report.energy);
  let activation = $derived(report.activation);

  let missingSamples = $derived(energy ? energy.meter_points_with_missing_samples : []);
  let l3 = $derived(energy ? energy.meter_points_with_l3_values : []);
  let mismatches = $derived(activation ? activation.mismatches : []);
  let activeMissing = $derived(activation ? activation.active_missing_from_podlist : []);
  let missingFromMasterdata = $derived(activation ? activation.missing_from_masterdata : []);

  // short label of what's wrong, shown in the collapsed header
  let summary = $derived.by(() => {
    if (report.error) return report.error;
    const parts = [];
    if (energy && !energy.measurements_complete) parts.push("Messdaten unvollständig");
    if (missingSamples.length) parts.push(`${missingSamples.length} ZP mit fehlenden Werten`);
    if (l3.length) parts.push(`${l3.length} ZP mit L3-Werten`);
    if (mismatches.length) parts.push(`${mismatches.length} Aktivierungs-Abweichungen`);
    if (activeMissing.length) parts.push(`${activeMissing.length} aktive ZP fehlen in Podlist`);
    if (missingFromMasterdata.length)
      parts.push(`${missingFromMasterdata.length} Podlist-ZP fehlen in Stammdaten`);
    return parts.length ? parts.join(" · ") : "Keine Probleme gefunden";
  });
</script>

<details
  class="group rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
  open={report.has_issues}
>
  <summary
    class="flex cursor-pointer list-none items-center gap-3 p-4 select-none"
  >
    <svg
      class="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90"
      viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
    >
      <path fill-rule="evenodd" d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
    </svg>
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium text-gray-900 dark:text-white" title={report.file_name}>
        {report.file_name}
      </div>
      <div class="truncate text-sm text-gray-500 dark:text-gray-400">{summary}</div>
    </div>
    {#if report.error}
      <StatusPill ok={false} issueLabel="Fehler" />
    {:else}
      <StatusPill ok={!report.has_issues} />
    {/if}
  </summary>

  {#if !report.error && energy}
    <div class="space-y-4 border-t border-gray-100 p-4 dark:border-gray-700">
      <div class="flex items-center gap-2 text-sm">
        <span class="text-gray-500 dark:text-gray-400">Messdaten vollständig:</span>
        <StatusPill ok={energy.measurements_complete} okLabel="ja" issueLabel="nein" />
      </div>

      {#if missingSamples.length}
        <div>
          <h4 class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Zählpunkte mit fehlenden Werten ({missingSamples.length})
          </h4>
          <ul class="space-y-0.5 text-sm text-gray-600 dark:text-gray-400">
            {#each missingSamples as mp}
              <li><span class="font-mono text-xs">{mp.meter_point_id}</span> — {mp.name}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if l3.length}
        <div>
          <h4 class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Zählpunkte mit L3-Werten (unzuverlässig) ({l3.length})
          </h4>
          <ul class="space-y-0.5 text-sm text-gray-600 dark:text-gray-400">
            {#each l3 as mp}
              <li><span class="font-mono text-xs">{mp.meter_point_id}</span> — {mp.name}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if activation}
        {#if mismatches.length}
          <div>
            <h4 class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Aktivierungs-Abweichungen ({mismatches.length})
            </h4>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="text-xs text-gray-500 dark:text-gray-400">
                  <tr>
                    <th class="py-1 pr-3">Zählpunkt</th>
                    <th class="py-1 pr-3">Status</th>
                    <th class="py-1 pr-3">Feld</th>
                    <th class="py-1 pr-3">Stammdaten</th>
                    <th class="py-1 pr-3">Podlist</th>
                    <th class="py-1 pr-3">Energiedaten</th>
                  </tr>
                </thead>
                <tbody class="text-gray-600 dark:text-gray-400">
                  {#each mismatches as m}
                    {#if !m.start_dates_agree}
                      <tr class="border-t border-gray-100 dark:border-gray-700">
                        <td class="py-1 pr-3 font-mono text-xs">{m.meter_point_id}</td>
                        <td class="py-1 pr-3">{m.status ?? "—"}</td>
                        <td class="py-1 pr-3">Start</td>
                        <td class="py-1 pr-3">{fmt(m.masterdata_activated)}</td>
                        <td class="py-1 pr-3">{fmt(m.podlist_activated)}</td>
                        <td class="py-1 pr-3">{fmt(m.energy_active_start)}</td>
                      </tr>
                    {/if}
                    {#if !m.end_dates_agree}
                      <tr class="border-t border-gray-100 dark:border-gray-700">
                        <td class="py-1 pr-3 font-mono text-xs">{m.meter_point_id}</td>
                        <td class="py-1 pr-3">{m.status ?? "—"}</td>
                        <td class="py-1 pr-3">Ende</td>
                        <td class="py-1 pr-3">{fmt(m.masterdata_deactivated)}</td>
                        <td class="py-1 pr-3">{fmt(m.podlist_active_until)}</td>
                        <td class="py-1 pr-3">{fmt(m.energy_active_end)}</td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        {#if activeMissing.length}
          <div>
            <h4 class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Aktive Zählpunkte, die in der Podlist fehlen ({activeMissing.length})
            </h4>
            <ul class="space-y-0.5 font-mono text-xs text-gray-600 dark:text-gray-400">
              {#each activeMissing as id}<li>{id}</li>{/each}
            </ul>
          </div>
        {/if}

        {#if missingFromMasterdata.length}
          <div>
            <h4 class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Podlist-Zählpunkte, die in den Stammdaten fehlen ({missingFromMasterdata.length})
            </h4>
            <ul class="space-y-0.5 font-mono text-xs text-gray-600 dark:text-gray-400">
              {#each missingFromMasterdata as id}<li>{id}</li>{/each}
            </ul>
          </div>
        {/if}
      {:else}
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Aktivierungs-Abgleich übersprungen (Stammdaten oder Podlist fehlen).
        </p>
      {/if}
    </div>
  {/if}
</details>
