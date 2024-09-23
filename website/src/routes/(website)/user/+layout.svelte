<script>
    import {signOut } from "@auth/sveltekit/client";
    import Navigation from "./Navigation.svelte";

    export let data;
</script>

<Navigation {data} />

{#if data.users}
    <slot />
{:else}
    Sie sind kein Vereinsmitglied.
    {#if data.session}
        <div>
            <button
                on:click={() => {
                    signOut();
                }}>Sign out</button
            >
        </div>
    {/if}
{/if}
