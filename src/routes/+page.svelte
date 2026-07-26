<script>
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import StatusPill from "$lib/StatusPill.svelte";
  import EnergyReportCard from "$lib/EnergyReportCard.svelte";

  /** @type {any} */
  let data = $state(null);
  let loading = $state(true);
  let errorMsg = $state("");

  async function load() {
    loading = true;
    errorMsg = "";
    try {
      data = await invoke("run_dashboard");
    } catch (e) {
      errorMsg = String(e);
    } finally {
      loading = false;
    }
  }

  onMount(load);

  let reportsWithIssues = $derived(
    data ? data.energy_reports.filter((r) => r.has_issues).length : 0,
  );
  let ownershipInvalid = $derived(
    data?.ownership
      ? data.ownership.transfers.filter((t) => !t.is_valid).length
      : 0,
  );
  let masterdataOk = $derived(
    data?.masterdata ? data.masterdata.file_complete : true,
  );
</script>

<div class="mx-auto max-w-5xl px-4 py-6">
  <!-- Header -->
  <div class="mb-6 flex items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        EEGFaktura Prüfung
      </h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {#if data}
          Dateien aus <span class="font-mono">{data.downloads_dir}</span>
        {:else}
          Prüft die aktuellsten Exporte aus deinem Download-Ordner
        {/if}
      </p>
    </div>
    <button
      onclick={load}
      disabled={loading}
      class="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? "Lädt…" : "Aktualisieren"}
    </button>
  </div>

  {#if errorMsg}
    <div
      class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300"
    >
      {errorMsg}
    </div>
  {/if}

  {#if loading && !data}
    <div class="flex items-center gap-3 py-16 text-gray-500 dark:text-gray-400">
      <svg class="h-6 w-6 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Dateien werden gelesen und geprüft…
    </div>
  {/if}

  {#if data}
    <!-- Warnings -->
    {#if data.warnings.length}
      <div
        class="mb-4 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
      >
        <ul class="space-y-1">
          {#each data.warnings as w}<li>⚠️ {w}</li>{/each}
        </ul>
      </div>
    {/if}

    <!-- Summary cards -->
    <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400">Stammdaten</span>
          {#if data.masterdata}
            <StatusPill ok={masterdataOk} />
          {:else}
            <span class="text-xs text-gray-400">fehlt</span>
          {/if}
        </div>
        {#if data.masterdata}
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {data.masterdata.missing_subscriptions.length} ohne Tarif ·
            {data.masterdata.missing_activations.length} ohne Aktivierung
          </p>
        {:else}
          <p class="text-sm text-gray-400">keine Datei gefunden</p>
        {/if}
        {#if data.masterdata_file}
          <p class="mt-1 truncate text-xs text-gray-400" title={data.masterdata_file}>
            {data.masterdata_file}
          </p>
        {/if}
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400">Eigentümerwechsel</span>
          {#if data.ownership}
            <StatusPill ok={ownershipInvalid === 0} />
          {:else}
            <span class="text-xs text-gray-400">n/a</span>
          {/if}
        </div>
        {#if data.ownership}
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {data.ownership.transfers.length} Wechsel · {ownershipInvalid} auffällig
          </p>
        {:else}
          <p class="text-sm text-gray-400">Stammdaten oder Podlist fehlen</p>
        {/if}
        {#if data.podlist_file}
          <p class="mt-1 truncate text-xs text-gray-400" title={data.podlist_file}>
            {data.podlist_file}
          </p>
        {/if}
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400">Energiereports</span>
          <StatusPill ok={reportsWithIssues === 0} />
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {data.energy_reports.length} geprüft · {reportsWithIssues} mit Problemen
        </p>
      </div>
    </div>

    <!-- Masterdata problems -->
    {#if data.masterdata && !masterdataOk}
      <details class="mb-4 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <summary class="cursor-pointer p-4 font-medium text-gray-900 dark:text-white">
          Stammdaten-Probleme
        </summary>
        <div class="space-y-4 border-t border-gray-100 p-4 dark:border-gray-700">
          {#if data.masterdata.missing_subscriptions.length}
            <div>
              <h4 class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Zählpunkte ohne Tarif ({data.masterdata.missing_subscriptions.length})
              </h4>
              <ul class="space-y-0.5 font-mono text-xs text-gray-600 dark:text-gray-400">
                {#each data.masterdata.missing_subscriptions as id}<li>{id}</li>{/each}
              </ul>
            </div>
          {/if}
          {#if data.masterdata.missing_activations.length}
            <div>
              <h4 class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Aktive Zählpunkte ohne Aktivierungsdatum ({data.masterdata.missing_activations.length})
              </h4>
              <ul class="space-y-0.5 font-mono text-xs text-gray-600 dark:text-gray-400">
                {#each data.masterdata.missing_activations as id}<li>{id}</li>{/each}
              </ul>
            </div>
          {/if}
        </div>
      </details>
    {/if}

    <!-- Ownership transfers -->
    {#if data.ownership && data.ownership.transfers.length}
      <details
        class="mb-8 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        open={ownershipInvalid > 0}
      >
        <summary class="cursor-pointer p-4 font-medium text-gray-900 dark:text-white">
          Eigentümerwechsel ({data.ownership.transfers.length})
        </summary>
        <div class="space-y-3 border-t border-gray-100 p-4 dark:border-gray-700">
          {#each data.ownership.transfers as t}
            <div class="rounded-md bg-gray-50 p-3 dark:bg-gray-900/40">
              <div class="mb-2 flex items-center justify-between gap-2">
                <span class="font-mono text-xs text-gray-700 dark:text-gray-300">{t.meter_point_id}</span>
                <StatusPill ok={t.is_valid} okLabel="sauber" issueLabel="auffällig" />
              </div>
              {#if !t.is_valid}
                <ul class="mb-2 space-y-0.5 text-xs text-red-700 dark:text-red-400">
                  {#each t.problems as p}<li>• {p}</li>{/each}
                  {#each t.stale_sources as s}
                    <li>
                      • {s.source} zeigt noch auf {s.activation_date}{s.former_owner
                        ? ` (früherer Eigentümer ${s.former_owner})`
                        : ""}
                    </li>
                  {/each}
                </ul>
              {/if}
              <table class="w-full text-left text-xs text-gray-600 dark:text-gray-400">
                <thead class="text-gray-400">
                  <tr>
                    <th class="pr-3 font-medium">Mitglied</th>
                    <th class="pr-3 font-medium">Status</th>
                    <th class="pr-3 font-medium">aktiviert</th>
                    <th class="pr-3 font-medium">deaktiviert</th>
                  </tr>
                </thead>
                <tbody>
                  {#each t.owners as o}
                    <tr>
                      <td class="pr-3">{o.member_number}</td>
                      <td class="pr-3">{o.status}</td>
                      <td class="pr-3">{o.activated ?? "—"}</td>
                      <td class="pr-3">{o.deactivated ?? "—"}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/each}
        </div>
      </details>
    {/if}

    <!-- Energy reports -->
    <h2 class="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
      Energiereports (aktuellste {data.energy_reports.length})
    </h2>
    {#if data.energy_reports.length === 0}
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Keine Energiereports gefunden. Exportiere aus EEG-Faktura nach Downloads.
      </p>
    {:else}
      <div class="space-y-3">
        {#each data.energy_reports as report (report.path)}
          <EnergyReportCard {report} />
        {/each}
      </div>
    {/if}
  {/if}
</div>
