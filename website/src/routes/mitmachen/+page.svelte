<script>
    import Paper, { Content } from "@smui/paper";
    import JoinForm from "$lib/JoinForm.svelte";
    import { Heading } from "flowbite-svelte";
    import Project from "$lib/Project.svelte";
</script>

<div class="text-center">
    <Heading tag="h2">Willkommen</Heading>
</div>
<div class="flex place-content-center">
    <Project img="" showMore={false}>
        <span slot="title">Wir brauchen noch ein paar Informationen</span>
        <div slot="content">
            <JoinForm />
        </div>
    </Project>
</div>

<style>
</style>
