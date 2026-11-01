<script>
  let { ok, okLabel = "OK", issueLabel = "Probleme" } = $props();
</script>

<span
  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap
  {ok
    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
    : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}"
>
  <span class="h-1.5 w-1.5 rounded-full {ok ? 'bg-green-500' : 'bg-red-500'}"></span>
  {ok ? okLabel : issueLabel}
</span>
