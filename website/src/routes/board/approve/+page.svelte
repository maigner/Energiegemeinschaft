<script>
    import Project from "$lib/Project.svelte";
    import { Blockquote, Button } from "flowbite-svelte";
    import { JSONEditor } from "svelte-jsoneditor";
    import MembershipApprovalForm from "./MembershipApprovalForm.svelte";
    import { signIn, signOut } from "@auth/sveltekit/client";
    import OpenTaskStatus from "./OpenTaskStatus.svelte";

    export let data;

    /** @type {import('./$types').ActionData} */
    export let form;

    let content = { json: { data: data, form: form } };

</script>


<!--
<JSONEditor bind:content />
-->

{#if data.member}
    <div class="max-w-xl m-auto justify-center">
        <figure class="m-4 text-center">
            <Blockquote alignment="center" size="xl" class="text-gray-900">
                Neue Mitglieder aufnehmen
            </Blockquote>
            <figcaption class="flex justify-center items-center mt-6 space-x-3">
                <div
                    class="flex items-center divide-x-2 divide-gray-500 dark:divide-gray-700"
                >
                    <cite class="pr-3 font-medium text-gray-900 dark:text-white"
                        >Abstimmungen</cite
                    >
                    <cite
                        class="pl-3 text-lg font-bold text-gray-500 dark:text-gray-400"
                        >es gibt {data.openTasks.length > 0
                            ? "etwas"
                            : "nichts"} zu tun</cite
                    >
                </div>
            </figcaption>
        </figure>
    </div>

    {#each data.openTasks as task}
        {#if task.name == "membershipApproval"}
            <div class="flex place-content-center mt-10">
                <Project img="" showMore={false}>
                    <span slot="title">Mitgliedschaft bestätigen</span>
                    <div slot="content" class="mt-6">
                        <MembershipApprovalForm bind:data={task.data} />
                    </div>
                </Project>
            </div>
        {/if}
    {/each}

    {#if Object.keys(data.taskStatus).length > 0}
        <div class="max-w-xl m-auto justify-center flex place-content-center">
            <OpenTaskStatus bind:taskStatus={data.taskStatus} />
        </div>
    {/if}
{:else}
    Ihre Email Adresse ist ungültig.
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
