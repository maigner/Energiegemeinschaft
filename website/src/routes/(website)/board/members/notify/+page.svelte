<script>
    import { enhance } from "$app/forms";
    import { Button } from "flowbite-svelte";
    import { JsonView } from "@zerodevx/svelte-json-view";

    let { data, form } = $props();
</script>

<h1 class="text-xl font-bold mb-2">Willkommensmails</h1>
<p class="mb-4">Mitglieder mit aktiviertem Zählpunkt, die noch keine Willkommensmail bekommen haben:</p>
<form method="POST" action="?/send" use:enhance class="mb-4">
    <Button type="submit">Willkommensmails jetzt senden</Button>
</form>
{#if form?.sent !== undefined}<p class="mb-4 text-green-700">Versand ausgelöst ({form.sent}).</p>{/if}
<JsonView json={data.pendingActiveNotifications} />
