<script>
    import Navigation from "./Navigation.svelte";
    import {signOut } from "@auth/sveltekit/client";

    export let data;
</script>

{#if data.boardMember}
    <Navigation bind:data />

    <slot />
{:else}
    Sie sind kein Vorstand.
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
