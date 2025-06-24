<script>
    import Navigation from "./Navigation.svelte";
    import { signOut } from "@auth/sveltekit/client";

    let { data, children } = $props();
</script>

{#if data.boardMember}
    <Navigation {data} />

    {@render children()}
{:else}
    Sie sind kein Vorstand.
    {#if data.session}
        <div>
            <button
                onclick={() => {
                    signOut();
                }}>Sign out</button
            >
        </div>
    {/if}
{/if}
