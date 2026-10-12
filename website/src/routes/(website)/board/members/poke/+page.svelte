<script>
    import { enhance } from "$app/forms";
    import { Button } from "flowbite-svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";

    let { data, form } = $props();
</script>

<h1 class="text-xl font-bold mb-2">Aktivierungs-Erinnerungen</h1>
<p class="mb-4">Der Versand läuft auch stündlich automatisch (Cron). Hier von Hand auslösen:</p>
<form method="POST" action="?/send" use:enhance class="mb-4">
    <Button type="submit">Erinnerungen jetzt senden</Button>
</form>
{#if form?.sent}<p class="mb-4 text-green-700">Versand ausgelöst.</p>{/if}
<h2 class="font-semibold">Erste Erinnerung fällig</h2>
<JsonView json={data.first} />
<h2 class="font-semibold mt-4">Zweite Erinnerung fällig</h2>
<JsonView json={data.second} />
